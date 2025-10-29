from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Form, HTTPException
from app.core.config import get_settings
from app.services.gemini import gemini_generate_script, DEFAULT_TEXT_MODEL
import json

router = APIRouter()

@router.post("/generate-script")
async def generate_script(
    report: str = Form(...),       # required
    angle_json: str = Form(...),   # required: {"title":"...","raw":"..."}
    landing_analysis: str = Form(""),
    angles_text: str = Form(""),
    angle_title: str = Form(""),
    angle_raw: str = Form(""),
    user_prompt: str = Form(""),
    script_inputs_json: str = Form(""),  # optional
    userId: str = Form("anon"),
    projectId: str = Form("default"),
    settings=Depends(get_settings),
):
    # Parse angle
    try:
        angle_payload = json.loads(angle_json) if angle_json else {}
        if not isinstance(angle_payload, dict):
            angle_payload = {}
    except json.JSONDecodeError:
        angle_payload = {}

    # Fallback nhỏ
    if not angle_payload.get("title") and angle_title:
        angle_payload["title"] = angle_title
    if not angle_payload.get("raw") and angle_raw:
        angle_payload["raw"] = angle_raw

    # Optional script_inputs
    script_inputs = None  # type: Optional[Dict[str, Any]]
    if (script_inputs_json or "").strip():
        try:
            parsed = json.loads(script_inputs_json)
            if isinstance(parsed, dict):
                script_inputs = parsed
        except json.JSONDecodeError:
            script_inputs = None

    if not (report or "").strip():
        raise HTTPException(status_code=400, detail="Thiếu report.")
    if not (angle_payload.get("title") or angle_payload.get("raw")):
        raise HTTPException(status_code=400, detail="Thiếu angle (title hoặc raw).")

    try:
        script_text, _ = await gemini_generate_script(
            api_key=settings.GEMINI_API_KEY,
            report=report,
            landing_analysis=landing_analysis,
            angle=angle_payload,
            angles_text=angles_text or None,
            user_prompt=user_prompt,
            model_name=getattr(settings, "GEMINI_MODEL_TEXT", DEFAULT_TEXT_MODEL),
            script_inputs=script_inputs,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Lỗi sinh Script từ Gemini: {}".format(e))

    if script_text.strip().upper().startswith("ERROR:"):
        raise HTTPException(status_code=502, detail=script_text.strip())

    return {"step": "script_done", "angle": angle_payload.get("title", ""), "script": script_text}
