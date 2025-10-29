import asyncio, os, time, tempfile, re
from pathlib import Path
from typing import Optional, Dict

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl

from app.core.config import get_settings
from app.services.gemini import generate_video_fast

router = APIRouter()
USE_GENAI_SDK = True

# ---- Local schemas -----------------------------------------------------------
class VideoReq(BaseModel):
    prompt: str
    beat: Optional[str] = None

    # Voice context
    vo_url: Optional[HttpUrl] = None       # URL mp3 đã tạo
    vo_text: Optional[str] = None          # nội dung VO tham chiếu
    duration_seconds: Optional[int] = None

    # Style/visual
    overlay_text: Optional[str] = None
    annotation: Optional[str] = None
    pacing: Optional[str] = None

    # kỹ thuật
    aspect_ratio: Optional[str] = None     # "9:16" | "16:9" | "1:1"
    resolution: Optional[str] = "720p"
    sample_count: Optional[int] = 1
    seed: Optional[int] = None
    model_name: Optional[str] = None

class VideoResp(BaseModel):
    step: str
    model: str
    url: str
    file: str
    meta: Dict

# ---- Local helpers -----------------------------------------------------------
def _slugify(value: str) -> str:
    value = str(value).strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "-", value)
    value = re.sub(r"-{2,}", "-", value)
    return value.strip("-") or "file"

def _constraint_block(*lines: str) -> str:
    lines = ["- {}".format(x) for x in lines if x and str(x).strip()]
    return "[CONSTRAINT]\n" + "\n".join(lines) + "\n\n" if lines else ""

async def _download_temp(url: str, suffix: str = ".mp3") -> Optional[Path]:
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            fd, tmp_path = tempfile.mkstemp(suffix=suffix)
            os.close(fd)
            Path(tmp_path).write_bytes(r.content)
            return Path(tmp_path)
    except Exception:
        return None

# ---- Route -------------------------------------------------------------------
@router.post("/generate-video", response_model=VideoResp)
async def generate_video_google(payload: VideoReq, settings=Depends(get_settings)):
    if not (payload.prompt or "").strip():
        raise HTTPException(status_code=400, detail="Thiếu prompt.")

    # 1) Tên file out
    prefix = _slugify(payload.beat or "veo3")
    ts = int(time.time() * 1000)
    name = f"{prefix}-{ts}.mp4"
    out_path: Path = settings.static_file_path("video", filename=name)

    # 2) Build constraint cho prompt
    c_lines = []
    if payload.aspect_ratio in {"9:16", "16:9", "1:1"}:
        c_lines.append(f"Aspect ratio: {payload.aspect_ratio}")
    if isinstance(payload.duration_seconds, int) and payload.duration_seconds > 0:
        c_lines.append(f"Target duration: ~{payload.duration_seconds}s (±2s)")
    if (payload.resolution or "").lower() in {"720p", "1080p"}:
        c_lines.append(f"Resolution: {payload.resolution}")
    if payload.overlay_text:
        c_lines.append(f"Overlay text: {payload.overlay_text}")
    if payload.pacing:
        c_lines.append(f"Pacing note: {payload.pacing}")
    if payload.annotation:
        c_lines.append(f"Annotation: {payload.annotation}")

    final_prompt = _constraint_block(*c_lines) + payload.prompt.strip()

    # 3) (tuỳ chọn) tải VO về file tạm
    audio_tmp: Optional[Path] = None
    if payload.vo_url:
        audio_tmp = await _download_temp(str(payload.vo_url), suffix=".mp3")

    # 4) Gọi SDK trong thread (generate_video_fast dùng sleep – tránh block loop)
    if not USE_GENAI_SDK:
        if audio_tmp:
            try:
                audio_tmp.unlink()
            except Exception:
                pass
        raise HTTPException(status_code=501, detail="GENAI SDK is disabled.")

    try:
        res = await asyncio.to_thread(
            generate_video_fast,
            prompt=final_prompt,
            out_path=str(out_path),
            audio_path=str(audio_tmp) if audio_tmp else None,
            aspect_ratio=payload.aspect_ratio or "9:16",
            model=payload.model_name or "veo-3.0-fast-generate-001",
            resolution=(payload.resolution or "720p"),
            seed=payload.seed,
            duration_hint_seconds=payload.duration_seconds,
            poll_sec=8,
        )

    except Exception as e:
        if audio_tmp:
            try:
                audio_tmp.unlink()
            except Exception:
                pass
        raise HTTPException(status_code=502, detail="Google Video API error: {}".format(e))

    # 5) Dọn file VO tạm
    if audio_tmp:
        try:
            audio_tmp.unlink()
        except Exception:
            pass

    # 6) Kết quả
    model_used = (res.get("model") if isinstance(res, dict) else None) \
                 or (payload.model_name or "veo-3.0-fast-generate-001")
    meta = res.get("meta") if isinstance(res, dict) else None
    if not isinstance(meta, dict):
        meta = {}
    meta.setdefault("constraints", c_lines)

    return VideoResp(
        step="video_done",
        model=model_used,
        url=settings.static_url("video", name),
        file=name,
        meta=meta,
    )
