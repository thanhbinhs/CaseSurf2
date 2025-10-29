# app/services/script_infer.py
from typing import Dict, Any, Tuple
import json
import re
import google.generativeai as genai

REQUIRED_KEYS = [
    "ProductName","TargetAudience","VisibleProblem","HiddenCause",
    "UniqueMechanism/USP","DesiredOutcome","CompetitorWeakness",
    "Villain","DesiredNextStep",
]

def _merge_non_empty(base: Dict[str, str], patch: Dict[str, str]) -> Dict[str, str]:
    out = dict(base or {})
    for k, v in (patch or {}).items():
        s = (v or "").strip()
        if s: out[k] = s
    return out

def _safe_json(s: str) -> Dict[str, Any]:
    try:
        return json.loads(s)
    except Exception:
        # thử bóc JSON trong text
        m = re.search(r"\{[\s\S]+\}", s)
        if m:
            try: return json.loads(m.group(0))
            except Exception: pass
    return {}

async def infer_required_inputs_from_context(
    *,
    api_key: str,
    model_name: str,
    report: str,
    landing_analysis: str,
    angle_text: str,
    seed_inputs: Dict[str, str] | None = None,
) -> Tuple[Dict[str, str], Dict[str, Any]]:
    """
    Dùng LLM để trích 9 trường bắt buộc từ context. Trả về (inputs, meta)
    """
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)

    schema_hint = (
        "Return STRICT JSON with exactly these keys:\n"
        + ", ".join(REQUIRED_KEYS) + ".\n"
        "Values must be strings (can be empty if truly not inferable). No extra keys."
    )

    prompt = (
        "[SYSTEM] Extract required marketing inputs from context.\n"
        f"{schema_hint}\n\n"
        "— CONTEXT START —\n"
        f"REPORT:\n{report}\n\n"
        f"LANDING ANALYSIS:\n{landing_analysis}\n\n"
        f"ANGLE TEXT:\n{angle_text}\n"
        "— CONTEXT END —\n"
    )

    parts = [{"text": prompt}]
    resp = await model.generate_content_async(parts)
    raw = resp.text or ""
    data = _safe_json(raw)

    # sanitize
    out: Dict[str, str] = {k: str(data.get(k, "") or "").strip() for k in REQUIRED_KEYS}
    if seed_inputs:
        out = _merge_non_empty(out, {k: (seed_inputs.get(k) or "").strip() for k in REQUIRED_KEYS})
    meta = {"raw": raw}
    return out, meta
