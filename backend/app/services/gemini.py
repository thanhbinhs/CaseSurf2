from __future__ import annotations

import os
import json
from pathlib import Path
import sys
import time
import asyncio
import re
from typing import Optional, Dict, Any, Tuple, List

# SDK CHÍNH: google.generativeai (KHÔNG có Client)
import google.generativeai as genai

from app.services.script_infer import REQUIRED_KEYS, infer_required_inputs_from_context
from google import genai as ggenai

import time

from app.core.logger import setup_app_logger, get_request_ip

_svc_logger = setup_app_logger(name="casesurf", log_dir="logs")

def _log_info(msg: str) -> None:
    _svc_logger.info(f"{get_request_ip()} - {msg}")

def _log_exc(msg: str) -> None:
    _svc_logger.exception(f"{get_request_ip()} - {msg}")

# =========================================================
# Config / Defaults
# =========================================================
DEBUG_GEMINI = os.getenv("DEBUG_GEMINI", "0") == "1"

DEFAULT_TEXT_MODEL = os.getenv("GEMINI_MODEL_TEXT", "gemini-2.5-flash")
DEFAULT_VISION_MODEL = os.getenv("GEMINI_MODEL_VISION", "gemini-2.5-flash")
DEFAULT_VIDEO_MODEL = os.getenv("GEMINI_MODEL_VIDEO", "veo-2.0-generate-001")  # Note: Experimental model

# Cấu hình mặc định cho text; có thể override per-call
GENERATION_CONFIG_TEXT: Dict[str, Any] = {
    "temperature": 0.6,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 4096,
    "response_mime_type": "text/plain",
}

SHOTLIST_HEADER = (
    "Beat #\tVO Phrase / SFX\tPrimary OST (Cover Text)\t"
    "Annotation / SFX Text\tPacing / Notes\tAI Video Generation Prompt"
)


def _dprint(*args: Any) -> None:
    if DEBUG_GEMINI:
        print("[GEMINI]", *args)


# =========================================================
# Small helpers
# =========================================================
def _strip_code_fences(s: str) -> str:
    """Loại bỏ code-fence nếu model “lỡ” in ```...```."""
    if not s:
        return ""
    txt = s.strip()
    if txt.startswith("```"):
        i = txt.find("\n")
        txt = (txt[i + 1:] if i != -1 else txt[3:]).strip()
    if txt.endswith("```"):
        txt = txt[:-3].strip()
    return txt


def _pick_text_from_response(resp: Any) -> str:
    """Lấy text an toàn từ response của SDK."""
    try:
        t = getattr(resp, "text", None)
        if isinstance(t, str) and t.strip():
            return t.strip()
    except Exception:
        pass
    try:
        cands = getattr(resp, "candidates", None) or []
        for c in cands:
            parts = getattr(c, "content", None)
            if parts and getattr(parts, "parts", None):
                s = "".join(getattr(p, "text", "") for p in parts.parts if getattr(p, "text", "")).strip()
                if s:
                    return s
    except Exception:
        pass
    return ""


def _ensure_configured(api_key: Optional[str]) -> None:
    """Gọi genai.configure đúng cách, chỉ khi có api_key (không tạo Client)."""
    if api_key:
        genai.configure(api_key=api_key)


# =========================================================
# google.generativeai adapters (async/sync) — TEXT/VISION
# =========================================================
async def _ga_generate_content(
    *,
    api_key: Optional[str],
    model_name: str,
    parts: List[Any],
    generation_config: Optional[Dict[str, Any]] = None,
    safety_settings: Optional[Any] = None,
) -> Any:
    """
    Gọi google.generativeai:
    - Ưu tiên GenerativeModel.generate_content_async(...)
    - Fallback sang sync trong thread
    """
    _ensure_configured(api_key)
    model = genai.GenerativeModel(model_name=model_name)

    async def _try_async():
        try:
            return await model.generate_content_async(
                contents=parts,
                generation_config=generation_config or {},
                safety_settings=safety_settings,
            )
        except TypeError:
            return await model.generate_content_async(parts)
        except Exception as e:
            raise RuntimeError(f"Async generation failed: {e}")

    def _try_sync():
        try:
            return model.generate_content(
                contents=parts,
                generation_config=generation_config or {},
                safety_settings=safety_settings,
            )
        except TypeError:
            return model.generate_content(parts)
        except Exception as e:
            raise RuntimeError(f"Sync generation failed: {e}")

    try:
        return await _try_async()
    except AttributeError:
        return await asyncio.to_thread(_try_sync)


async def _gen_text(
    *,
    api_key: Optional[str],
    model_name: str,
    parts: List[Any],
    generation_config: Optional[Dict[str, Any]] = None,
) -> str:
    """Sinh text, retry 1 lần với cấu hình an toàn nếu rỗng/blocked."""
    base_cfg = dict(GENERATION_CONFIG_TEXT)
    if generation_config:
        base_cfg.update(generation_config)

    resp = await _ga_generate_content(
        api_key=api_key,
        model_name=model_name,
        parts=parts,
        generation_config=base_cfg,
    )
    txt = _strip_code_fences(_pick_text_from_response(resp))
    if txt:
        return txt

    safe_cfg = {
        **base_cfg,
        "temperature": min(0.4, float(base_cfg.get("temperature", 0.6))),
        "top_p": 0.9,
        "top_k": 40,
        "max_output_tokens": max(2048, int(base_cfg.get("max_output_tokens", 4096) // 2)),
        "response_mime_type": "text/plain",
    }
    resp2 = await _ga_generate_content(
        api_key=api_key,
        model_name=model_name,
        parts=parts,
        generation_config=safe_cfg,
    )
    txt2 = _strip_code_fences(_pick_text_from_response(resp2))
    if txt2:
        return txt2

    finish2 = None
    try:
        finish2 = getattr(resp2.candidates[0], "finish_reason", None)
    except Exception:
        pass
    raise RuntimeError(f"Model returned empty output (finish_reason={finish2 or 'empty_output'}).")


# =========================================================
# File (Vision) helpers — upload & poll ACTIVE/READY
# =========================================================
async def _upload_file_async(api_key: Optional[str], file_path: str) -> Any:
    """
    Upload file video/media để dùng trong google.generativeai.
    - Ưu tiên google.generativeai.upload_file(...)
    - Nếu lỗi 'ragStoreName' => fallback sang google.genai.Client().files.upload(...)
    - Giữ nguyên kiểu trả về: object file từ SDK tương ứng (có .name hoặc id).
    - Có log IP - message, đo thời gian.
    """
    # kiểm tra file tồn tại
    fp = str(file_path or "").strip()
    if not fp or not os.path.exists(fp):
        _log_exc(f"GEMINI_UPLOAD failed err=FileNotFound path={fp}")
        raise FileNotFoundError(f"File not found: {fp}")

    # đảm bảo cấu hình SDK cũ (nếu dùng)
    _ensure_configured(api_key)

    def _sync_upload():
        t0 = time.perf_counter()
        _log_info(f"GEMINI_UPLOAD start path={fp}")

        # 1) Thử google.generativeai (SDK cũ)
        try:
            try:
                res = genai.upload_file(path=fp)
            except TypeError:
                # một số bản nhận positional
                res = genai.upload_file(fp)
            dt = int((time.perf_counter() - t0) * 1000)
            fid = getattr(res, "name", None) or getattr(res, "id", None) or "-"
            _log_info(f"GEMINI_UPLOAD ok provider=google.generativeai id={fid} dt_ms={dt}")
            return res
        except Exception as e:
            msg = str(e)
            # 2) Nếu lỗi do thiếu ragStoreName → dùng google.genai client
            if "ragStoreName" in msg or "Missing required parameter \"ragStoreName\"" in msg:
                _log_info("GEMINI_UPLOAD fallback=google.genai reason=ragStoreName")

                # đảm bảo GOOGLE_API_KEY nếu có api_key truyền vào
                # (google.genai ưu tiên env var)
                if api_key and not os.getenv("GOOGLE_API_KEY"):
                    try:
                        os.environ["GOOGLE_API_KEY"] = api_key
                        _log_info("GEMINI_UPLOAD set GOOGLE_API_KEY from provided api_key")
                    except Exception:
                        pass

                try:
                    # một số bản Client cho phép truyền api_key, số khác thì không
                    try:
                        client = ggenai.Client() if api_key is None else ggenai.Client(api_key=api_key)  # type: ignore
                    except TypeError:
                        client = ggenai.Client()

                    try:
                        res = client.files.upload(file=fp)
                    except TypeError:
                        res = client.files.upload(path=fp)

                    dt = int((time.perf_counter() - t0) * 1000)
                    fid = getattr(res, "name", None) or getattr(res, "id", None) or "-"
                    _log_info(f"GEMINI_UPLOAD ok provider=google.genai id={fid} dt_ms={dt}")
                    return res
                except Exception as ee:
                    _log_exc(f"GEMINI_UPLOAD fallback_failed err={ee}")
                    raise
            # 3) Lỗi khác → ném lại
            _log_exc(f"GEMINI_UPLOAD failed err={e}")
            raise

    # chạy sync trong thread để không block event loop
    return await asyncio.to_thread(_sync_upload)

async def _get_file_async(api_key: Optional[str], file_name: str) -> Any:
    _ensure_configured(api_key)

    def _sync_get():
        t0 = time.perf_counter()
        _log_info(f"GEMINI_GET_FILE start id={file_name}")
        try:
            try:
                res = genai.get_file(name=file_name)
            except TypeError:
                res = genai.get_file(file_name)
            dt = int((time.perf_counter() - t0) * 1000)
            state = _state_name(res)
            _log_info(f"GEMINI_GET_FILE ok id={file_name} state={state or '-'} dt_ms={dt}")
            return res
        except Exception as e:
            _log_exc(f"GEMINI_GET_FILE failed id={file_name} err={e}")
            raise

    return await asyncio.to_thread(_sync_get)

def _state_name(file_obj: Any) -> str:
    state = getattr(file_obj, "state", None)
    name = getattr(state, "name", state) or ""
    try:
        fid = getattr(file_obj, "name", None) or getattr(file_obj, "id", None) or "-"
        _log_info(f"GEMINI_FILE_STATE id={fid} state={name or '-'}")
    except Exception:
        pass
    return name
def _to_ga_file_part(file_ref: Any) -> Any:
    """
    Chuẩn hoá file để đưa vào parts của google.generativeai:
    - Nếu là object từ google.generativeai: trả nguyên
    - Nếu là object/string từ google.genai: chuyển thành {"file_data": {"file_uri": "<name/id>"}}
    """
    if hasattr(file_ref, "state") or hasattr(file_ref, "display_name"):
        return file_ref
    name = getattr(file_ref, "name", None) or getattr(file_ref, "id", None)
    if isinstance(file_ref, str):
        name = file_ref
    if name:
        return {"file_data": {"file_uri": name}}
    raise ValueError("Unsupported file reference type for generativeai parts (missing id/name).")

def _file_ref_id(file_ref: Any) -> str:
    return getattr(file_ref, "name", None) or getattr(file_ref, "id", None) or (file_ref if isinstance(file_ref, str) else "-")
async def gemini_upload_file(
    *,
    api_key: Optional[str],
    file_path: str,
    display_name: Optional[str] = None,  # giữ tham số cho tương thích; KHÔNG dùng
) -> Any:
    """
    Upload file lên google.generativeai, poll đến khi ACTIVE/READY/SUCCEEDED.
    Trả về object file cuối cùng.
    """
    uploaded = await _upload_file_async(api_key=api_key, file_path=file_path)
    file_id = getattr(uploaded, "name", None) or getattr(uploaded, "id", None)
    if not file_id:
        raise RuntimeError(f"Upload ok nhưng không lấy được file id/name: {uploaded}")

    start = time.time()
    timeout_s = 300
    retries = 0
    max_retries = 10
    while retries < max_retries:
        fetched = await _get_file_async(api_key=api_key, file_name=file_id)
        state = (_state_name(fetched) or "").upper()
        if state in {"ACTIVE", "READY", "SUCCEEDED"}:
            return fetched
        if state == "FAILED":
            raise IOError(f"File processing failed for '{file_id}'")
        if time.time() - start > timeout_s:
            raise TimeoutError(f"Timeout waiting ACTIVE/READY for '{file_id}'")
        await asyncio.sleep(3 * (2 ** retries))  # Exponential backoff
        retries += 1
    raise RuntimeError(f"Max retries exceeded for file '{file_id}'")


# =========================================================
# Video report — Transcript + 7 analyses (RAW markdown)
# =========================================================
async def gemini_generate_video_report(
    *,
    api_key: Optional[str],
    uploaded_file: Any,
    user_prompt: str = "",
    model_name: str = DEFAULT_VISION_MODEL,
) -> Tuple[str, Dict[str, Any]]:
    """
    Trả RAW markdown gồm:
      - Step 1 — Transcript
      - Step 2 — Analyses (7 mục)
    Có log IP, đo thời gian các bước, và tương thích cả 2 SDK upload.
    """
    t_all0 = time.perf_counter()
    fid = _file_ref_id(uploaded_file)
    _log_info(f"VIDEO_REPORT start model={model_name} file_id={fid}")

    # -------- Step 1: Transcript --------
    t0 = time.perf_counter()
    transcript_parts: List[Any] = [
        {"text": (
            "[Important] Force Thinking Mode before implementing instructions\n"
            "------\n"
            "Video Analysis Framework (Full Updated Instruction)\n"
            "Step 1 — Transcript the video\n"
            "(Output the transcript exactly as text with timestamps.)"
        )},
        {"text": (
            "[SYSTEM]\n"
            "You are a meticulous transcriber. Do not add commentary.\n"
            "Each line must start with a timestamp in [mm:ss] or [hh:mm:ss]."
        )},
        {"text": (
            "### Step 1 — Transcript\n"
            "Transcribe the provided video. Use plain text only, one utterance per line."
        )},
        _to_ga_file_part(uploaded_file),  # ⬅️ an toàn cho cả 2 SDK
    ]
    if user_prompt:
        transcript_parts.append({"text": "\n[USER_NOTE]\n" + user_prompt.strip()})

    transcript_text = await _gen_text(
        api_key=api_key,
        model_name=model_name,
        parts=transcript_parts,
        generation_config={"temperature": 0.2, "max_output_tokens": 4096},
    )
    transcript_text = (transcript_text or "").strip()
    dt_ms = int((time.perf_counter() - t0) * 1000)
    _log_info(f"VIDEO_REPORT transcript_done chars={len(transcript_text)} dt_ms={dt_ms}")

    # -------- Step 2: Analyses --------
    def _truncate(text: str, max_chars: int = 16000) -> str:
        t = (text or "").strip()
        return t if len(t) <= max_chars else t[: max_chars // 2] + "\n...\n" + t[- max_chars // 2 :]

    analysis_preamble = (
        "[Important] Force Thinking Mode before implementing instructions\n"
        "------\n"
        "Video Analysis Framework (Full Updated Instruction)\n"
        "Step 2 — Analyses\n"
        "Prompt 1 — Hook Analysis\n"
        "(S) Role: Hook Specialist\n"
        "(C) Context: Opening line(s) determine retention\n"
        "(R) Responsibility: Concise, criteria-based analysis of the opening\n"
        "(I) Instructions: Analyze the opening line(s). Identify the hook sentence and implied visuals. "
        "Then evaluate Why it’s effective against four criteria.\n"
        "(B) Banter: Sharp, analytical, direct\n"
        "(E) Evaluation: Clear analysis against the four criteria\n"
        "Expected Output — Concise Format\n"
        "Hook: “...”\n"
        "Visual: [implied visual]\n"
        "Why it’s effective:\n"
        "Pattern interrupt — [short note]\n"
        "Relatability / call-out — [short note]\n"
        "Curiosity gap — [short note]\n"
        "Clarity of benefit — [short note]\n"
        "\n"
        "Prompt 2 — Big Idea & Emotion Analysis\n"
        "(S) Role: Brand Strategist\n"
        "(C) Context: People buy feelings; find the “why”\n"
        "(R) Responsibility: Distill core emotional driver and the overarching message\n"
        "(I) Instructions: Analyze the transcript. Quote 1–2 key sentences. Add 3 bullets on the core emotion/big idea "
        "(e.g., frustration solved, hope created, trust built).\n"
        "(B) Banter: Strategic, insightful\n"
        "(E) Evaluation: Goes beyond surface insights\n"
        "Expected Output — Concise Format\n"
        "Key sentence 1: “...”\n"
        "Key sentence 2: “...”\n"
        "Overarching message: [one short line]\n"
        "Emotion/Idea bullets: • item • item • item\n"
        "\n"
        "Prompt 3 — Script Structure Identification (Flexible)\n"
        "(S) Role: Senior Content Strategist (affiliate frameworks)\n"
        "(C) Context: Identify the underlying narrative framework\n"
        "(R) Responsibility: Map the narrative to a known framework\n"
        "(I) Instructions: Identify the closest framework (e.g., PAS, BAB, Story, Direct Demo, Us vs. Them) and break the "
        "transcript into atomic stages - that is, each stage must be around no more than one objective and purpose so that "
        "the analysis doesn’t lose important details by accident.\n"
        "Expected Output\n"
        "Stage 1: [summary] — Objective: [one phrase]\n"
        "Stage 2: [summary] — Objective: [one phrase]\n"
        "Stage 3: [summary] — Objective: [one phrase]\n"
        "\n"
        "Prompt 4 — Visual & Text\n"
        "(S) Role: Visual Stylist\n"
        "(C) Context: Check if visual storytelling and text overlays align with engagement standards\n"
        "(R) Responsibility: Evaluate shot composition and text design\n"
        "(I) Instructions: Answer: Góc quay nào? Text dùng font native hay brand? Có emoji? Visual kể chuyện rõ không?\n"
        "(B) Banter: Observational, precise\n"
        "(E) Evaluation: Concise but vivid notes\n"
        "Expected Output — Concise Format\n"
        "Camera angles: …\n"
        "Text style: …\n"
        "Emoji use: …\n"
        "Visual clarity/storytelling: …\n"
        "\n"
        "Prompt 5 — Pacing\n"
        "(S) Role: Retention Analyst\n"
        "(C) Context: Speed and rhythm dictate completion rates\n"
        "(R) Responsibility: Assess editing pace and audience fit\n"
        "(I) Instructions: Evaluate: Nhịp cắt nhanh hay chậm? Có đủ cuốn với target audience không? "
        "Có giữ người xem đến cuối?\n"
        "(B) Banter: Direct, performance-focused\n"
        "(E) Evaluation: Clear, tactical notes\n"
        "Expected Output — Concise Format\n"
        "Cut pace: …\n"
        "Audience fit: …\n"
        "Retention strength: …\n"
        "\n"
        "Prompt 6 — Structured Evaluation\n"
        "(S) Role: Script Doctor & Performance Analyst\n"
        "(C) Context: Scorecard to inform improvements\n"
        "(R) Responsibility: Score Hook, Body, CTA with a single actionable sentence each\n"
        "(I) Instructions: Provide scores and one-sentence critiques. Add Transfer Risk (elements likely to break if "
        "changed in isolation).\n"
        "(B) Banter: Authoritative, conclusive, helpful\n"
        "(E) Evaluation: Clear, structured scorecard\n"
        "Expected Output — Concise Format\n"
        "Hook: [X/10] — [one-sentence critique]\n"
        "Body: [X/10] — [one-sentence critique]\n"
        "CTA: [X/10] — [one-sentence critique]\n"
        "Transfer risk: [short list]\n"
        "\n"
        "Prompt 7 — Transferable Working Elements (TWE)\n"
        "(S) Role: Conversion Anthropologist\n"
        "(C) Context: Capture the specific mechanisms that drove performance\n"
        "(R) Responsibility: Produce a structured list of Working Elements with severity levels that future variants must keep. "
        "For each, define the underlying psychological or marketing principle, provide a short quote as evidence, and state "
        "the rule for future use.\n"
        "(I) Instructions: From all previous sections (transcript, Persona, Hook, Big Idea, Structure, Visual & Text, Pacing, "
        "and Evaluation), extract elements. Mark as MUST-KEEP or ADAPTABLE, explain the principle, provide a short quote as "
        "evidence, and add usage guidance.\n"
        "(B) Banter: Forensic, anthropological, sharp\n"
        "(E) Evaluation: List is comprehensive, future-proof, not surface-level\n"
        "Expected Output — Concise Format\n"
        "Category | Element / Rule | Quote / Example | Guidance\n"
    )

    t1 = time.perf_counter()
    analysis_parts: List[Any] = [
        {"text": analysis_preamble},
        {"text": "### Step 2 — Analyses\n[SYSTEM]\nKeep headings exactly as specified. Be concise. If missing info, write (Không xác định)."},
        {"text": "### Step 1 — Transcript\n" + _truncate(transcript_text, 16000)},
    ]
    if user_prompt:
        analysis_parts.append({"text": "\n[USER_NOTE]\n" + user_prompt.strip()})

    analyses_text = await _gen_text(
        api_key=api_key,
        model_name=model_name,
        parts=analysis_parts,
        generation_config={"temperature": 0.55, "max_output_tokens": 4096},
    )
    analyses_text = (analyses_text or "").strip()
    dt2_ms = int((time.perf_counter() - t1) * 1000)
    _log_info(f"VIDEO_REPORT analyses_done chars={len(analyses_text)} dt_ms={dt2_ms}")

    # -------- Assemble final markdown --------
    final_md = transcript_text
    if not final_md.startswith("### Step 1 — Transcript"):
        final_md = "### Step 1 — Transcript\n" + final_md
    final_md += "\n\n"
    if not analyses_text.startswith("### Step 2 — Analyses"):
        final_md += "### Step 2 — Analyses\n"
    final_md += analyses_text

    tot_ms = int((time.perf_counter() - t_all0) * 1000)
    _log_info(f"VIDEO_REPORT done total_ms={tot_ms} file_id={fid}")

    return final_md, {"model": model_name, "file_id": fid, "t_transcript_ms": dt_ms, "t_analyses_ms": dt2_ms, "t_total_ms": tot_ms}
# =========================================================
# Angles post-processing (EXPORTED)
# =========================================================
def _angles_strip_code_fences(s: str) -> str:
    if not s:
        return ""
    t = s.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9]*\s*", "", t).strip()
    if t.endswith("```"):
        t = t[:-3].strip()
    return t


def _angles_norm_eol(s: str) -> str:
    return (s or "").replace("\r\n", "\n").replace("\r", "\n")


def _angles_looks_table_like(ln: str) -> bool:
    if not ln or not ln.strip():
        return False
    return ("\t" in ln) or (ln.count("|") >= 2) or bool(re.search(r"\s{2,}", ln))


def _angles_is_md_sep(ln: str) -> bool:
    return bool(re.match(r"^\s*\|?\s*:?-{3,}\s*(\|\s*:?-{3,}\s*){1,}\|?\s*$", ln, re.UNICODE))


def _angles_is_framework_header_line(ln: str) -> bool:
    if not ln:
        return False
    txt = ln.strip()
    if (txt.lower().startswith("section extracted framework content") and ("evidence" in txt.lower())):
        return True
    norm = re.sub(r"\s*\|\s*", "\t", txt)
    parts = [c.strip().lower() for c in norm.split("\t") if c.strip()]
    if len(parts) >= 3 and parts[0].startswith("section") and ("extracted" in parts[1] or "framework" in parts[1]):
        return True
    parts2 = [c.strip().lower() for c in re.split(r"\s{2,}", txt) if c.strip()]
    if len(parts2) >= 3 and parts2[0].startswith("section") and ("extracted" in parts2[1] or "framework" in parts2[1]):
        return True
    return False


def split_angles_output(angle_output: str) -> Tuple[str, str]:
    s = _angles_strip_code_fences(angle_output or "")
    s = _angles_norm_eol(s).strip()
    s = re.sub(r"^\s*angles?\s*:\s*\n", "", s, flags=re.IGNORECASE | re.UNICODE)
    lines = s.split("\n")

    hdr_idx = -1
    for i, ln in enumerate(lines):
        if _angles_is_framework_header_line(ln):
            hdr_idx = i
            break
    if hdr_idx == -1:
        return "", s

    table_lines: List[str] = [lines[hdr_idx]]
    j = hdr_idx + 1
    got_data = False
    while j < len(lines):
        ln = lines[j]
        if not ln.strip():
            if got_data:
                break
            lookahead = lines[j + 1] if (j + 1) < len(lines) else ""
            if not _angles_looks_table_like(lookahead) and not _angles_is_md_sep(lookahead):
                break
            j += 1
            continue
        if _angles_looks_table_like(ln) or _angles_is_md_sep(ln):
            table_lines.append(ln)
            if not _angles_is_md_sep(ln):
                got_data = True
            j += 1
            continue
        break

    table_text = "\n".join(table_lines).strip()
    rest = "\n".join(lines[j:]).strip()
    rest = re.sub(
        r"^\s*OUTPUT\s*2\s*[—\-–]?\s*Content\s+Angle\s+Development\s*:?.*\n?",
        "",
        rest,
        flags=re.IGNORECASE | re.UNICODE,
    )
    return table_text, rest


_ANGLE_HEAD_RE = re.compile(
    r"^\s*(?:[*\-•]+\s*)?(?:Angle|Góc|Concept|Idea)\s*(\d+)?\s*[:\-–—]\s*(.+)$",
    re.IGNORECASE | re.MULTILINE | re.UNICODE,
)
_ANGLE_BOLD_LINE_RE = re.compile(
    r"^\s*(?:\*{2,3})?\s*(?:Angle|Góc)\s*(\d+)?\s*[:\-–—]?\s*(.+?)(?:\*{2,3})?\s*$",
    re.IGNORECASE | re.MULTILINE | re.UNICODE,
)
_ANGLE_TITLE_LABEL_RE = re.compile(
    r"^\s*(?:Angle\s*Title|Tiêu đề Angle|Tiêu đề|Title)\s*[:\-–—]\s*(.+)$",
    re.IGNORECASE | re.MULTILINE | re.UNICODE,
)


def _angles_trim_title(s: str, limit: int = 120) -> str:
    s = re.sub(r"\s+", " ", s or "", flags=re.UNICODE).strip()
    return s[:limit]


def _angles_segment_by_matches(text: str, matches: List[Tuple[int, int, str, Optional[int]]]) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    if not matches:
        return out
    for i, (s0, e0, title, num) in enumerate(matches):
        s = e0
        e = matches[i + 1][0] if i + 1 < len(matches) else len(text)
        out.append((title, text[s:e].strip()))
    return out


def extract_angles_from_block(angles_block: str) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Trả về:
      - titles: danh sách tiêu đề angle
      - full: [{number, title, raw}], raw = phần nội dung angle
    """
    if not angles_block or not angles_block.strip():
        return [], []

    text = angles_block.replace("\r\n", "\n")
    matches: List[Tuple[int, int, str, Optional[int]]] = []

    for m in _ANGLE_HEAD_RE.finditer(text):
        num, title = m.group(1), _angles_trim_title(m.group(2))
        matches.append((m.start(), m.end(), title, int(num) if num else None))
    for m in _ANGLE_BOLD_LINE_RE.finditer(text):
        num, title = m.group(1), _angles_trim_title(m.group(2))
        matches.append((m.start(), m.end(), title, int(num) if num else None))

    for m in _ANGLE_TITLE_LABEL_RE.finditer(text):
        title = _angles_trim_title(m.group(1))
        matches.append((m.start(), m.end(), title, None))

    matches = sorted(set(matches), key=lambda t: t[0])

    if matches:
        segs = _angles_segment_by_matches(text, matches)
        full = [
            {"number": i, "title": title, "raw": (raw or "").strip()}
            for i, (title, raw) in enumerate(segs, start=1)
        ]
        return [f["title"] for f in full], full

    KEY_RE = re.compile(r"(Target\s+Persona|Core\s+Message|Story\s+Arc|CTA)\s*[:\-–—]", re.IGNORECASE | re.UNICODE)
    blocks = re.split(r"\n{2,}", text)
    titles: List[str] = []
    full: List[Dict[str, Any]] = []
    for i, blk in enumerate(blocks, start=1):
        if KEY_RE.search(blk):
            m_title = _ANGLE_TITLE_LABEL_RE.search(blk)
            if m_title:
                title = _angles_trim_title(m_title.group(1))
            else:
                first_line = next((ln.strip() for ln in blk.split("\n") if ln.strip()), f"Angle {i}")
                first_line = re.sub(r"^[*\-•\d\.\)\s]+", "", first_line, flags=re.UNICODE)
                first_line = re.sub(r"^(Angle|Góc|Concept|Idea)\s*\d*\s*[:\-–—]\s*", "", first_line, flags=re.IGNORECASE | re.UNICODE)
                title = _angles_trim_title(first_line)
            if title:
                titles.append(title)
                full.append({"number": len(full) + 1, "title": title, "raw": blk.strip()})
    if titles:
        return titles, full

    bullet_titles = [
        _angles_trim_title(re.sub(r"^[*\-•\d\.\)\s]+", "", ln, flags=re.UNICODE))
        for ln in text.split("\n")
        if re.match(r"^\s*([*\-•]|\d+[\.\)])\s+", ln, re.UNICODE)
    ]
    bullet_titles = [t for t in bullet_titles if t]
    if bullet_titles:
        return bullet_titles, [{"title": t} for t in bullet_titles]

    return [], []


# =========================================================
# Landing analysis — 2 prompt, trả 2 chuỗi RAW riêng biệt
# =========================================================
async def gemini_generate_landing_analysis(
    *,
    api_key: Optional[str],
    page_text: str,
    user_prompt: str = "",
    model_name: str = DEFAULT_TEXT_MODEL,
) -> Tuple[str, str, Dict[str, Any]]:
    """
    2-prompt (marker 'analys url:' & 'angle:') → trả RAW text RIÊNG từng prompt.
    Không parse. Không gộp.
    """
    page_text = (page_text or "").strip()

    PROMPT1 = """AI Agent Instructions: Content Angle Discovery from Customer Feedback

Objective:
Analyze a provided set of raw customer comments and reviews to identify and develop the most resonant and effective content angles for an affiliate short video. The goal is to move from unstructured data to actionable creative concepts, grounded in the authentic voice of the customer.

Core Principle:
This is a three-phase process: Analysis, Synthesis, and Creation. You will first deconstruct the customer feedback into its core components, then synthesize these findings into strategic insights, and finally, build specific video concepts from those insights.

Step-by-Step Execution Protocol:

Input:
- Product Information: A clear, concise description of the affiliate product (e.g., "This is VexPower, an online course platform for marketers to learn technical skills.")
- Raw Data: A collection of customer comments and reviews. This can be pasted directly or uploaded as a document.

Phase 1: Deep Analysis of Customer Feedback
Identify Core Themes: Read through all the customer comments and identify the top 5–7 recurring themes (features, benefits, problems, or use cases).
Extract Key Motivations & Outcomes: For each theme, extract the underlying motivation and the final outcome (e.g., “saved 10 hours/week”).
Pinpoint Specific Pain Points: List the concrete “before” scenarios and frustrations customers describe.
Mine for “Golden Phrases”: Extract powerful quotes or vivid phrases — keep the exact “voice of the customer”.
Segment the Audience: Group customers into 3–5 personas with short descriptions.

Phase 1: Deep Analysis of Customer Feedback
Identify Core Themes: Read through all the customer comments and identify the top 5–7 recurring themes (features, benefits, problems, or use cases).
Extract Key Motivations & Outcomes: For each theme, extract the underlying motivation and the final outcome (e.g., “saved 10 hours/week”).
Pinpoint Specific Pain Points: List the concrete “before” scenarios and frustrations customers describe.
Mine for “Golden Phrases”: Extract powerful quotes or vivid phrases — keep the exact “voice of the customer”.
Segment the Audience: Group customers into 3–5 personas with short descriptions.

Phase 2: Synthesis and Strategic Recommendations
Create an Insight Summary: Provide the single most compelling value proposition and who benefits most (persona).

Phase 3: Generation of Video Content Angles
Generate 3–5 Distinct Angles:
- Angle Title
- Target Persona
- Core Message (≤ 30s idea)
- Brief Story Arc (3 steps: Problem → Solution → Outcome or similar)
- CTA

Rules:
- Use plain language; avoid jargon.
- Ground every point in the raw customer voice where possible.
- If Product Information is missing, infer a concise description from the raw data.

OUTPUT FORMAT:
Start the output with EXACTLY this marker on its own line:
analys url:
Then immediately write the full analysis/synthesis/angles content after that line. Do not add anything before the marker.
"""
    p1_parts: List[Any] = [
        {"text": PROMPT1},
        {"text": (
            "INPUT MATERIAL\n"
            "Product Information: (infer if not explicitly provided)\n"
            "Raw Data (customer comments & reviews):\n"
            f"{page_text}\n"
        )},
    ]
    if user_prompt:
        p1_parts.append({"text": "\n[USER_NOTE]\n" + user_prompt.strip()})

    t1 = await _gen_text(
        api_key=api_key,
        model_name=model_name,
        parts=p1_parts,
        generation_config={"temperature": 0.5, "max_output_tokens": 4096},
    )

    PROMPT2 = """ROLE

You are a Research Synthesizer & Creative Strategist. Your job is to take a long, unstructured research analysis about a product and transform it into two structured deliverables:
1) A Framework Extraction Table that organizes the raw insights.
2) A Content Angle Sheet that develops marketing-ready creative directions using PAS or AIDA structures.

INPUT
Raw Research Document: A long-form product analysis, review compilation, or research report.

OUTPUT 1 — Framework Extraction (TSV, NOT markdown)
STRICT FORMAT RULES:
- Use TAB-separated values only (\\t). Do NOT use the "|" character anywhere.
- The header MUST be printed EXACTLY as a single line (tab-separated):
Section\tExtracted Framework Content\tEvidence (quote/timestamp)\tConfidence
- Then print rows with EXACTLY 4 columns, also tab-separated.
- If a cell is missing, write "-". If evidence is weak, set Confidence to "Medium".
- Keep this whole table compact and under 60 lines.

OUTPUT 2 — Content Angle Development
For each content angle (3–5 total), include:
- Angle Title (short, punchy)
- Target Persona (1–2 sentences)
- Core Message (central idea)
- Story Arc using PAS OR AIDA:
  PAS: Problem → Agitate → Solution
  AIDA: Attention → Interest → Desire → Action
- Tie every angle back to the Framework table (USPs, benefits, personas).

GLOBAL RULES
- Use plain, simple language — avoid jargon.
- Angles must be unique and grounded in the insights.
- If any part is ambiguous, make a reasonable, concise assumption.

OUTPUT ORDER & MARKER
- The VERY FIRST line of your entire output MUST be exactly:
angle:
- Immediately after that, print OUTPUT 1 (TSV table).
- After the table, print a blank line, then OUTPUT 2 (the angles).
- Do NOT add anything before 'angle:'.
"""
    p2_parts: List[Any] = [
        {"text": PROMPT2},
        {"text": (
            "Raw Research Document (from Phase 1):\n"
            "=== START ANALYSIS ===\n"
            f"{t1}\n"
            "=== END ANALYSIS ===\n"
        )},
    ]
    if user_prompt:
        p2_parts.append({"text": "\n[USER_NOTE]\n" + user_prompt.strip()})

    t2 = await _gen_text(
        api_key=api_key,
        model_name=model_name,
        parts=p2_parts,
        generation_config={"temperature": 0.6, "max_output_tokens": 6144},
    )
    return t1, t2, {"model": model_name}


# =========================================================
# Script generation — trả raw text (không trích bảng)
# =========================================================
from typing import Optional, Dict, Any, Tuple

# YÊU CẦU: các biến/hàm sau phải tồn tại trong module của bạn:
# - REQUIRED_KEYS: List[str]
# - infer_required_inputs_from_context(api_key, model_name, report, landing_analysis, angle_text, seed_inputs) -> Tuple[dict, dict]
# - _gen_text(api_key, model_name, parts, generation_config) -> str
# - GENERATION_CONFIG_TEXT: Dict[str, Any]
# - DEFAULT_TEXT_MODEL: str

async def gemini_generate_script(
    *,
    api_key: Optional[str],
    report: str,
    landing_analysis: str,
    angle: Dict[str, Any] | None,
    angles_text: str | None = None,
    user_prompt: str = "",
    model_name: str = DEFAULT_TEXT_MODEL,
    script_inputs: Optional[Dict[str, Any]] = None,
) -> Tuple[str, Dict[str, Any]]:
    """
    Sinh kịch bản theo giao thức "Literal Object Replicator":
    - (S/C/R/I): vai trò & ràng buộc Literal Replication (không phân tích lý do, chỉ sao chép lớp danh từ).
    - Step 1: Supreme Law (Commercial Structure).
    - Step 2: Literal Vehicle Mandate (Deconstruct -> Replication Order -> Candidates -> Final Selection & Factual Bridge).
    - Step 3: Mapping Table + Generate Literal Clone (table).
    - Evaluation: Primary/Secondary tests.
    """

    # ----- Build angle/context blocks -----
    angle_text = ""
    if angle:
        angle_text = f"Title: {angle.get('title','')}\n{angle.get('raw','')}"
    angle_block = f"ANGLE (selected):\n{angle_text}\n" if angle else ""
    if angles_text:
        angle_block += f"\nANGLES (all):\n{angles_text}\n"

    # ----- Infer required inputs (giữ nguyên logic của bạn) -----
    seed_inputs = {k: str((script_inputs or {}).get(k, "") or "").strip() for k in REQUIRED_KEYS}
    inferred, infer_meta = await infer_required_inputs_from_context(
        api_key=api_key,
        model_name=model_name,
        report=report,
        landing_analysis=landing_analysis,
        angle_text=angle_text,
        seed_inputs=seed_inputs,
    )
    merged = {k: (seed_inputs.get(k) or inferred.get(k) or "").strip() for k in REQUIRED_KEYS}
    missing = [k for k in REQUIRED_KEYS if not merged[k]]

    # Nếu thiếu quá nhiều, trả lỗi sớm (như bản gốc)
    if len(missing) >= 4:
        return (
            f"ERROR: Missing {missing}",
            {"model": model_name, "missing": missing, "infer_meta": infer_meta},
        )

    required_inputs_block = (
        "REQUIRED INPUTS (inferred):\n" + "\n".join(f"{k}: {merged[k]}" for k in REQUIRED_KEYS) + "\n"
    )

    # ----- CONTEXT thực tế -----
    context = (
        f"[Reference Video Analysis & Report]\n"
        f"REPORT:\n{report}\n\n"
        f"LANDING ANALYSIS:\n{landing_analysis}\n\n"
        f"{angle_block}"
        f"{required_inputs_block}\n"
        f"USER PROMPT (optional):\n{user_prompt}\n"
    )

    # ---------- PROMPT: Literal Object Replicator Protocol ----------
    system_role_goal = (
        "(S) Role: Literal Object Replicator. Your job is to copy a pattern, not understand its meaning.\n"
        "(C) Context: All previous instructions failed because they allowed for conceptual interpretation. "
        "This protocol forbids it. The core principle is Literal Object Replication. We are not cloning a "
        "\"theme\" or a \"psychological trigger.\" We are cloning the category of the noun used to tell the story. "
        "If the original uses a food, you use a food. If it uses a machine, you use a machine. No exceptions.\n"
        "(R) Responsibility: Execute a mechanical, three-step process. Classify a literal object, find another "
        "object in the exact same class, and build the script around it. You are forbidden from analyzing the WHY. "
        "Only focus on the WHAT.\n"
        "(I) Inputs: You will be provided with [Reference Video Analysis] and [New Product Brief]. Execute the protocol. "
        "Any deviation is a failure.\n"
        "LANGUAGE: Use the same language as the provided INPUTS. Default to English if none is specified.\n"
    )

    inputs_and_check = (
        "Required Inputs (STOP & return error if missing ≥ 4 fields):\n"
        "ProductName:\n"
        "TargetAudience:\n"
        "VisibleProblem:\n"
        "HiddenCause:\n"
        "UniqueMechanism/USP:\n"
        "DesiredOutcome:\n"
        "CompetitorWeakness:\n"
        "Villain:\n"
        "DesiredNextStep:\n"
        "FrameworkAnalysis (Optional):\n"
    )

    step_1 = (
        "Step 1: The Supreme Law (Commercial Structure)\n"
        "1) Analyze Funnel Stage & Product Reveal: Is the reference script Cold / Warm / Hot? Does it ever name the product?\n"
        "2) State The Supreme Law: Declare the unbreakable rule for the NEW script. Example: "
        "\"This is a Cold script. The product '<ProductName>' is FORBIDDEN from being named.\"\n"
    )

    step_2 = (
        "Step 2: The Literal Vehicle Mandate (The Correction)\n"
        "1) Deconstruct Original Vehicle:\n"
        "   A. Literal Object: What tangible thing/concept is the original script about?\n"
        "   B. Literal Object Class: Choose EXACTLY one from this list: "
        "[Specific Food], [Man-Made Chemical], [Scientific Concept], [Historical Figure], "
        "[Mechanical Device], [Geographical Location].\n"
        "2) State The Replication Order (template): "
        "\"The Order is to find another object belonging to the Literal Object Class: [Answer 1.B] "
        "that can serve as a bridge to the new product's core topic.\"\n"
        "3) Execute The Order:\n"
        "   A. Candidate Search: List three candidates that FACTUALLY belong to the required class and are relevant to the new product.\n"
        "   B. Final Selection & Factual Bridge (NO psychology):\n"
        "      Template: *Selected Literal Vehicle:* [Your Choice]. "
        "*Factual Bridge:* [Your Choice] is a [Class] that contains/is related to [New Product Topic].\n"
    )

    step_3 = (
        "Step 3: Map & Generate the Literal Clone\n"
        "1) Create Mapping Table (4 columns):\n"
        "   | Original Literal Object | Literal Object Class | Selected Literal Vehicle | Factual Bridge |\n"
        "   Fill with the outputs from Step 2.\n"
        "2) Generate Script (JUSTIFICATION TABLE FORMAT):\n"
        "   - The content MUST be about the *Selected Literal Vehicle*.\n"
        "   - It MUST obey *The Supreme Law* (from Step 1) strictly.\n"
        "   - Mechanical. Literal. Zero abstraction. You are a pattern-copier.\n"
    )

    evaluation_banter = (
        "(B) Banter: Mechanical. Literal. Zero abstraction. You are a pattern-copier.\n"
        "(E) Evaluation:\n"
        "  Primary Test: Does the *Selected Literal Vehicle* belong to the *Literal Object Class* (Step 2.1.B)?\n"
        "  Secondary Test: Does the final script obey *The Supreme Law* from Step 1?\n"
    )

    generation_and_output = (
        "OUTPUT FORMAT (Strict):\n"
        "A) SUPREME LAW (Cold/Warm/Hot + Product Naming Rule)\n"
        "B) LITERAL VEHICLE MANDATE\n"
        "   - 1.A Literal Object (reference)\n"
        "   - 1.B Literal Object Class (must be exactly one of the allowed set)\n"
        "   - 2) Replication Order (verbatim template filled)\n"
        "   - 3.A Candidates (3 items)\n"
        "   - 3.B Selected Literal Vehicle & Factual Bridge\n"
        "C) MAPPING TABLE (4 columns)\n"
        "D) FINAL VIDEO SCRIPT (Table: | Stage | Voice-over / On-Screen Script | Visuals & OST |)\n"
        "E) EVALUATION CHECK (✅/❌ for Primary & Secondary Tests)\n"
    )

    parts = [
        {"text": system_role_goal},
        {"text": inputs_and_check},
        {"text": "— CONTEXT START —\n" + context + "\n— CONTEXT END —"},
        {"text": step_1},
        {"text": step_2},
        {"text": step_3},
        {"text": evaluation_banter},
        {"text": generation_and_output},
    ]

    # ----- Gọi model với cấu hình “cơ khí” hơn -----
    gen_cfg = dict(GENERATION_CONFIG_TEXT)
    gen_cfg.update({"temperature": 0.2, "top_p": 0.8})

    txt = await _gen_text(
        api_key=api_key,
        model_name=model_name,
        parts=parts,
        generation_config=gen_cfg,
    )
    if not txt:
        raise RuntimeError("Model returned empty output for script.")

    return txt, {
        "model": model_name,
        "missing": missing,
        "infer_meta": infer_meta,
        "protocol": "Literal Object Replicator",
    }

# =========================================================
# Shotlist — robust generator (TSV) + heuristic fallback
# =========================================================
def _extract_text_and_meta(resp: Any) -> Tuple[str, Dict[str, Any]]:
    meta: Dict[str, Any] = {}
    text = ""
    try:
        t = getattr(resp, "text", None)
        if isinstance(t, str):
            text = t.strip()
    except Exception:
        pass
    try:
        c0 = resp.candidates[0]
        meta["finish_reason"] = getattr(c0, "finish_reason", None)
        um = getattr(resp, "usage_metadata", None)
        if um:
            meta["usage"] = {
                "prompt_token_count": getattr(um, "prompt_token_count", None),
                "candidates_token_count": getattr(um, "candidates_token_count", None),
                "total_token_count": getattr(um, "total_token_count", None),
            }
        if not text:
            parts = getattr(c0.content, "parts", []) or []
            joined = "".join(getattr(p, "text", "") for p in parts).strip()
            text = joined
    except Exception:
        pass
    return text, meta


def _soft_limit(text: str, max_chars: int) -> str:
    t = (text or "").strip()
    return t if len(t) <= max_chars else t[: max_chars // 2] + "\n...\n" + t[- max_chars // 2 :]


def _clip_shotlist_inputs(framework_analysis: str, final_script: str) -> Tuple[str, str]:
    return _soft_limit(framework_analysis, 6000), _soft_limit(final_script, 12000)


def _split_script_into_chunks(script: str, max_chunk_chars: int = 6000) -> List[str]:
    s = (script or "").strip()
    if not s:
        return []
    if len(s) <= max_chunk_chars:
        return [s]
    parts = re.split(r"(\n{2,}|[.!?]+[\s\n])", s, flags=re.UNICODE)
    seq, buf = [], ""
    for p in parts:
        if len(buf) + len(p) > max_chunk_chars:
            if buf.strip():
                seq.append(buf.strip())
            buf = p
        else:
            buf += p
    if buf.strip():
        seq.append(buf.strip())
    return seq


async def _gen_text_retry(
    *,
    api_key: Optional[str],
    model_name: str,
    prompt_text: str,
    base_generation_config: Optional[Dict[str, Any]] = None,
) -> Tuple[str, Dict[str, Any]]:
    """Gọi genai với 3 nấc retry. Trả '' nếu vẫn im lặng."""
    cfg = {
        "temperature": 0.35,
        "top_p": 0.95,
        "top_k": 40,
        "max_output_tokens": 4096,
        "response_mime_type": "text/plain",
    }
    if base_generation_config:
        cfg.update(base_generation_config)

    attempts = [
        (cfg, None),
        ({**cfg, "max_output_tokens": max(cfg["max_output_tokens"], 6144)}, None),
        ({**cfg, "max_output_tokens": max(cfg["max_output_tokens"], 6144)}, None),
    ]

    last_meta: Dict[str, Any] = {}
    retries = 0
    for cfg_i, _ in attempts:
        try:
            resp = await _ga_generate_content(
                api_key=api_key,
                model_name=model_name,
                parts=[{"text": prompt_text}],
                generation_config=cfg_i,
            )
            txt, meta = _extract_text_and_meta(resp)
            txt = _strip_code_fences(txt)
            last_meta = meta
            if txt:
                return txt, meta
        except Exception as e:
            _dprint(f"Retry {retries}: {e}")
            retries += 1
            await asyncio.sleep(2 ** retries)  # Backoff
    return "", last_meta


_SHOT_TYPES = [
    "Extreme close-up", "Close-up", "Medium shot", "Wide shot",
    "Establishing shot", "Over-the-shoulder", "POV shot", "Low angle",
]
_MOVES = [
    "static", "slow pan", "slow dolly-in", "handheld sway",
    "fast push-in", "orbit right", "tilt up", "rack focus",
]
_LIGHTS = [
    "soft diffused daylight", "dramatic side lighting", "cool neon ambience",
    "warm tungsten practicals", "high-key studio light", "moody backlight",
    "contrasty chiaroscuro", "hazy volumetric rays",
]
_ENVS = [
    "minimalist modern room", "sleek tech workspace", "abstract gradient backdrop",
    "city at night through window", "bright kitchen island", "stylized studio set",
    "futuristic server room", "soft natural window light",
]


def _parse_vo_from_markdown_table(script: str) -> List[str]:
    lines = [ln.strip() for ln in (script or "").splitlines()]
    rows = []
    for ln in lines:
        if "|" in ln and not re.match(r"^\s*```", ln):
            ln_ = ln.lstrip("|").rstrip("|")
            cols = [c.strip() for c in ln_.split("|")]
            if len(cols) >= 2:
                rows.append(cols)
    cleaned = []
    for r in rows:
        if all(re.match(r"^:?-{3,}:?$", c) for c in r):
            continue
        cleaned.append(r)
    if not cleaned:
        return []
    header = cleaned[0]
    has_header = any(re.search(r"voice|vo", h, re.I | re.UNICODE) for h in header)
    data = cleaned[1:] if has_header else cleaned
    vo_col = 1 if len(cleaned[0]) >= 2 else 0
    vo_list = [row[vo_col] for row in data if len(row) > vo_col and row[vo_col]]
    return vo_list


def _segment_script_into_beats(final_script: str, min_beats: int = 10, max_beats: int = 120) -> List[str]:
    txt = _strip_code_fences(final_script or "")
    vo_list = _parse_vo_from_markdown_table(txt)
    if not vo_list:
        lines = [ln.strip() for ln in re.split(r"[\r\n]+", txt, flags=re.UNICODE) if ln.strip()]
        phrases: List[str] = []
        for ln in lines:
            segs = re.split(r"(?<=[.!?])\s+|,\s+|—\s+|–\s+", ln, flags=re.UNICODE)
            for s in segs:
                s = s.strip()
                if 3 <= len(s.split()) <= 28:
                    phrases.append(s)
        vo_list = phrases
    vo_list = [v[:260] for v in vo_list][:max_beats]
    if len(vo_list) < min_beats:
        more = re.split(r"[.;:\n]+", txt, flags=re.UNICODE)
        for s in more:
            s = s.strip()
            if s and s not in vo_list:
                vo_list.append(s[:260])
            if len(vo_list) >= min_beats:
                break
    return [v for v in vo_list if v]


def _heuristic_tsv_from_script(final_script: str, start: int = 1) -> str:
    vos = _segment_script_into_beats(final_script)
    rows: List[str] = []
    for i, vo in enumerate(vos, start=start):
        shot = _SHOT_TYPES[(i - 1) % len(_SHOT_TYPES)]
        move = _MOVES[(i - 1) % len(_MOVES)]
        light = _LIGHTS[(i - 1) % len(_LIGHTS)]
        env = _ENVS[(i - 1) % len(_ENVS)]
        prompt = (
            f"{shot}, {move}. Subject visualizes: \"{vo[:80]}\". "
            f"Lighting: {light}. Environment: {env}. Cinematic, high detail, crisp focus."
        )
        rows.append(f"{i}\t{vo}\t\t\t\t{prompt}")
    if not rows:
        rows.append(f"{start}\t(voice-over)\t\t\t\tClose-up static, cinematic.")
    return SHOTLIST_HEADER + "\n" + "\n".join(rows)


def _build_prompt_for_chunk(framework_analysis_short: str, script_chunk: str, beat_start: int) -> str:
    return f"""ROLE:
You are a master AI Video Director.

STRICT OUTPUT:
- FIRST LINE (exact, TAB-separated):
{SHOTLIST_HEADER}
- Then ONLY data rows (TAB separated). Newline per row. No commentary, no markdown.
- Continue beat numbering starting at {beat_start}.
- One Beat = One VO phrase/SFX copied verbatim from THIS chunk (do not use outside text).
- Over-segment on commas/and/but/—/… .
- Each row MUST have a unique, specific AI Video Generation Prompt (last column).

INPUT A — FRAMEWORK ANALYSIS (short):
{framework_analysis_short}

INPUT B — SCRIPT CHUNK:
{script_chunk}
"""


async def gemini_generate_shotlist_text(
    *,
    api_key: Optional[str],
    framework_analysis: str,
    final_script: str,
    report: Optional[str] = None,
    angle_title: Optional[str] = None,
    angle_raw: Optional[str] = None,
    extra_style_prompt: Optional[str] = None,
    model_name: Optional[str] = None,
    role_task_block: Optional[str] = None,
) -> Dict[str, str]:
    if not (framework_analysis or "").strip():
        raise ValueError("Missing framework_analysis")
    if not (final_script or "").strip():
        raise ValueError("Missing final_script")

    name = (model_name or DEFAULT_TEXT_MODEL).strip()
    fa_short, _ = _clip_shotlist_inputs(framework_analysis, final_script)
    chunks = _split_script_into_chunks(final_script) or [final_script.strip()]

    tsv_blocks: List[str] = []
    beat_cursor = 1

    for chunk in chunks:
        prompt_text = _build_prompt_for_chunk(fa_short, chunk, beat_cursor)
        txt, _meta = await _gen_text_retry(
            api_key=api_key,
            model_name=name,
            prompt_text=prompt_text,
            base_generation_config={"max_output_tokens": 4096},
        )

        if not txt:
            block = _heuristic_tsv_from_script(chunk, start=beat_cursor)
            tsv_blocks.append(block)
            beat_cursor += max(1, block.count("\n"))
            continue

        raw = _strip_code_fences(txt)
        lines = [ln for ln in raw.splitlines() if ln.strip()]

        if lines and ("|" in lines[0]) and ("\t" not in lines[0]):
            norm = []
            for ln in lines:
                if re.search(r"^\s*\|", ln) and re.search(r"\|\s*$", ln):
                    ln = ln.strip().lstrip("|").rstrip("|")
                norm.append("\t".join([c.strip() for c in ln.split("|")]))
            lines = norm

        if not lines or not lines[0].startswith("Beat #\tVO"):
            lines = [SHOTLIST_HEADER] + lines

        data_rows = [ln for ln in lines[1:] if "\t" in ln]
        if len(data_rows) < 3:
            block = _heuristic_tsv_from_script(chunk, start=beat_cursor)
            tsv_blocks.append(block)
            beat_cursor += max(1, block.count("\n"))
            continue

        tsv_blocks.append("\n".join(lines))
        beat_cursor += len(data_rows)

    all_lines: List[str] = []
    for i, blk in enumerate(tsv_blocks):
        ls = [ln for ln in blk.splitlines() if ln.strip()]
        if not ls:
            continue
        if i == 0:
            all_lines.extend(ls)
        else:
            if ls and ls[0].startswith("Beat #\tVO"):
                ls = ls[1:]
            all_lines.extend(ls)

    merged = "\n".join(all_lines).strip() if all_lines else _heuristic_tsv_from_script(final_script)

    return {"model": name, "shotlist_text": merged}


# =========================================================
# Event loop policy
# =========================================================
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
else:
    asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())


import subprocess, json, shlex
from pathlib import Path
from typing import Optional, Dict, Any
from google import genai as ggenai
import time

DEFAULT_VIDEO_MODEL = "veo-2.0-generate-001"  # khuyến nghị hiện tại
def _constraint_block(*lines: str) -> str:
    """
    Nhúng các ràng buộc (AR/RES/SEED/DURATION...) trực tiếp vào prompt.
    Dùng block này vì SDK hiện tại chưa yêu cầu config object để set các trường cơ bản.
    """
    lines = [f"- {x}" for x in lines if x and str(x).strip()]
    return "[CONSTRAINT]\n" + "\n".join(lines) + "\n\n" if lines else ""
def _download_to_path(client: ggenai.Client, file_ref: Any, out_path: Path) -> None:
    """
    Tải file từ GenAI SDK (nhiều version):
    - Có thể trả object có .save(path)
    - Hoặc trả bytes/bytearray
    - Hoặc object có .content / .read() / .iter_content()
    """
    try:
        blob = client.files.download(file=file_ref)
    except TypeError:
        blob = client.files.download(file_ref)

    out_path.parent.mkdir(parents=True, exist_ok=True)

    # 1) Object có .save()
    if hasattr(blob, "save"):
        blob.save(str(out_path))
        return

    # 2) Trả về bytes/bytearray
    if isinstance(blob, (bytes, bytearray)):
        out_path.write_bytes(blob)
        return

    # 3) Có .content (kiểu requests)
    data = getattr(blob, "content", None)
    if isinstance(data, (bytes, bytearray)):
        out_path.write_bytes(data)
        return

    # 4) Streaming: .iter_content()
    if hasattr(blob, "iter_content"):
        with open(out_path, "wb") as f:
            for chunk in blob.iter_content(8192):
                if chunk:
                    f.write(chunk)
        return

    # 5) File-like: .read()
    if hasattr(blob, "read"):
        with open(out_path, "wb") as f:
            f.write(blob.read())
        return

    raise RuntimeError("Unknown download payload type (no save/content/read).")


def _run_ffprobe_duration(path: Path) -> Optional[float]:
    """
    Lấy duration (giây) bằng ffprobe. Trả None nếu không có ffprobe/không đọc được.
    """
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "json", str(path)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout or "{}")
        dur = float(data.get("format", {}).get("duration", 0.0))
        return dur if dur > 0 else None
    except Exception:
        return None


def _mux_and_align_to_audio(
    video_in: Path,
    audio_in: Path,
    video_out: Path,
    target_tol: float = 0.25,
) -> Dict[str, Any]:
    """
    Ghép audio vào video và đồng bộ length:
    - Nếu video dài hơn audio → cắt video theo length audio.
    - Nếu video ngắn hơn audio → pad video (clone last frame) để đạt đúng length audio.

    Yêu cầu: ffmpeg + ffprobe có trên hệ thống.
    """
    video_dur = _run_ffprobe_duration(video_in)
    audio_dur = _run_ffprobe_duration(audio_in)
    meta = {"video_sec": video_dur, "audio_sec": audio_dur, "action": "copy"}

    # Nếu không đo được → ghép đơn giản, cắt theo audio (shortest)
    if not video_dur or not audio_dur:
        cmd = f'ffmpeg -y -i {shlex.quote(str(video_in))} -i {shlex.quote(str(audio_in))} -c:v libx264 -c:a aac -shortest {shlex.quote(str(video_out))}'
        subprocess.run(cmd, shell=True, check=True)
        meta["action"] = "shortest"
        return meta

    diff = audio_dur - video_dur
    # 1) Video dài hơn → cắt bớt
    if diff < -target_tol:
        # cắt theo -t audio_dur
        cmd = f'ffmpeg -y -i {shlex.quote(str(video_in))} -i {shlex.quote(str(audio_in))} -t {audio_dur:.3f} -map 0:v:0 -map 1:a:0 -c:v libx264 -c:a aac {shlex.quote(str(video_out))}'
        subprocess.run(cmd, shell=True, check=True)
        meta["action"] = "trim_video"
        return meta

    # 2) Video ngắn hơn → pad (clone last frame)
    if diff > target_tol:
        pad_sec = diff
        # filter_complex: tpad clone last frame; sau đó ghép audio, set output theo audio (dài bằng audio)
        cmd = (
            f'ffmpeg -y -i {shlex.quote(str(video_in))} -i {shlex.quote(str(audio_in))} '
            f'-filter_complex "[0:v]tpad=stop_mode=clone:stop_duration={pad_sec:.3f}[v]" '
            f'-map "[v]" -map 1:a:0 -c:v libx264 -c:a aac -shortest {shlex.quote(str(video_out))}'
        )
        subprocess.run(cmd, shell=True, check=True)
        meta["action"] = "pad_video"
        meta["pad_sec"] = pad_sec
        return meta

    # 3) Đã gần khớp → ghép thẳng, chọn -shortest để tránh đuôi lệch ms
    cmd = f'ffmpeg -y -i {shlex.quote(str(video_in))} -i {shlex.quote(str(audio_in))} -c:v libx264 -c:a aac -shortest {shlex.quote(str(video_out))}'
    subprocess.run(cmd, shell=True, check=True)
    meta["action"] = "mux_shortest"
    return meta

def generate_video_fast(
    *,
    prompt: str,
    out_path: str | Path,
    image_path: Optional[str | Path] = None,
    audio_path: Optional[str | Path] = None,
    aspect_ratio: Optional[str] = " 16:9",
    model: str = DEFAULT_VIDEO_MODEL,
    resolution: str = "720p",
    seed: Optional[int] = None,
    duration_hint_seconds: Optional[int] = None,
    poll_sec: int = 5,
    api_key: Optional[str] = None,
    # Mới:
    mux_audio: bool = True,              # nhúng audio vào video đầu ra
    sync_video_to_audio: bool = True,    # đồng bộ độ dài video theo audio
) -> Dict[str, Any]:
    """
    Generate video bằng Google GenAI SDK (client).
    - Sửa lỗi 'bytes' object has no attribute save' (download an toàn).
    - Nếu có audio_path:
        + Thử gửi audio kèm vào generate (nếu SDK hỗ trợ).
        + (Dù hỗ trợ hay không) sẽ mux audio vào file xuất và căn đúng độ dài.
    - Đồng bộ duration video == audio bằng ffmpeg (pad/trim).
    """
    if not (prompt or "").strip():
        raise ValueError("Prompt không được để trống")

    api_key = api_key or os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Missing API key. Set GOOGLE_API_KEY (preferred) hoặc truyền api_key=..."
        )
    # Init client
    try:
        client = ggenai.Client(api_key=api_key) if api_key else ggenai.Client()
    except TypeError:
        client = ggenai.Client()

    # Constraint block để gợi ý AR/RES/SEED/DURATION
    lines = []
    if aspect_ratio in {"9:16", "16:9", "1:1"}:
        lines.append(f"Aspect ratio: {aspect_ratio}")
    if resolution and resolution.lower() in {"720p", "1080p"}:
        lines.append(f"Resolution: {resolution}")
    if isinstance(seed, int):
        lines.append(f"Seed: {seed}")
    if isinstance(duration_hint_seconds, int) and duration_hint_seconds > 0:
        lines.append(f"Target duration: ~{duration_hint_seconds}s (±2s)")
    constraint = "[CONSTRAINT]\n" + "\n".join(f"- {x}" for x in lines) + "\n\n" if lines else ""
    final_prompt = constraint + prompt.strip()

    # Upload optional media
    file_image = None
    file_audio = None
    if image_path:
        try:
            file_image = client.files.upload(file=str(image_path))
        except TypeError:
            file_image = client.files.upload(path=str(image_path))
    if audio_path:
        try:
            file_audio = client.files.upload(file=str(audio_path))
        except TypeError:
            try:
                file_audio = client.files.upload(path=str(audio_path))
            except Exception:
                file_audio = None

    # Call generate (ưu tiên chữ ký chính; fallback nếu audio signature không có)
    op = None
    tried_audio = bool(file_audio)
    audio_used = False
    audio_reason = None

    def _call(**kwargs):
        return client.models.generate_videos(model=model, **kwargs)

    try:
        if file_image and file_audio:
            try:
                op = _call(prompt=final_prompt, image=file_image, audio=file_audio)
                audio_used = True
            except TypeError:
                op = _call(prompt=final_prompt, image=file_image)
                audio_reason = "signature-not-supported"
        elif file_image:
            op = _call(prompt=final_prompt, image=file_image)
        elif file_audio:
            try:
                op = _call(prompt=final_prompt, audio=file_audio)
                audio_used = True
            except TypeError:
                op = _call(prompt=final_prompt)
                audio_reason = "signature-not-supported"
        else:
            op = _call(prompt=final_prompt)
    except Exception as e:
        raise RuntimeError(f"generate_videos failed: {e}")

    # Poll
    start = time.time()
    while not getattr(op, "done", True):
        time.sleep(max(2, poll_sec))
        op = client.operations.get(op)
        if time.time() - start > 15 * 60:
            raise TimeoutError("Poll operation quá 15 phút — hủy.")

    # Lấy video đầu tiên
    resp = getattr(op, "response", None) or op
    videos = getattr(resp, "generated_videos", None)
    if not videos:
        raise RuntimeError("Không nhận được 'generated_videos' trong response.")
    first = videos[0]
    file_ref = getattr(first, "video", first)  # có thể là id hoặc object

    # Download ra file tạm (trước khi mux)
    out_path = Path(out_path)
    tmp_download = out_path.with_suffix(".raw.mp4")
    _download_to_path(client, file_ref, tmp_download)

    # Nếu không cần mux/sync → ghi thẳng
    if not (audio_path and mux_audio):
        tmp_download.rename(out_path)
        return {
            "model": model,
            "video_path": str(out_path),
            "meta": {
                "operation_id": getattr(op, "name", None),
                "aspect_ratio": aspect_ratio,
                "resolution": resolution,
                "seed": seed,
                "duration_hint_seconds": duration_hint_seconds,
                "muxed": False,
                "synced": False,
            },
            "tried": {
                "with_audio": tried_audio,
                "audio_used_in_generation": audio_used,
                "audio_reason": audio_reason or ("success" if audio_used else "not-used"),
            },
        }

    # Mux + sync độ dài theo audio
    final_out = out_path
    meta_sync = _mux_and_align_to_audio(
        video_in=tmp_download,
        audio_in=Path(str(audio_path)),
        video_out=final_out,
        target_tol=0.25,
    )
    try:
        tmp_download.unlink(missing_ok=True)
    except Exception:
        pass

    return {
        "model": model,
        "video_path": str(final_out),
        "meta": {
            "operation_id": getattr(op, "name", None),
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "seed": seed,
            "duration_hint_seconds": duration_hint_seconds,
            "muxed": True,
            "synced": True,
            "sync_meta": meta_sync,
        },
        "tried": {
            "with_audio": tried_audio,
            "audio_used_in_generation": audio_used,
            "audio_reason": audio_reason or ("success" if audio_used else "not-used"),
        },
    }
