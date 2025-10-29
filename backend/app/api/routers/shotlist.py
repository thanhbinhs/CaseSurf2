from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.config import get_settings
from app.services.gemini import gemini_generate_shotlist_text, DEFAULT_TEXT_MODEL

router = APIRouter()

# Local schemas (để tự chứa)
class ShotBeat(BaseModel):
    beat: str
    vo: str
    primary_ost: str
    annotation: str
    pacing: str
    prompt: str

class GenerateShotlistRequest(BaseModel):
    framework_analysis: str
    final_script: str
    report: str = ""
    angle_title: str = ""
    angle_raw: str = ""
    extra_style_prompt: str = ""
    model_name: str = ""

class GenerateShotlistResponse(BaseModel):
    step: str
    model: str
    shotlist_text: str
    beats: List[ShotBeat]

@router.post("/generate-shotlist", response_model=GenerateShotlistResponse)
async def generate_shotlist_endpoint(payload: GenerateShotlistRequest, settings=Depends(get_settings)):
    fa = (payload.framework_analysis or "").strip()
    fs = (payload.final_script or "").strip()
    if not fa:
        raise HTTPException(status_code=400, detail="Thiếu framework_analysis.")
    if not fs:
        raise HTTPException(status_code=400, detail="Thiếu final_script.")

    try:
        out = await gemini_generate_shotlist_text(
            api_key=settings.GEMINI_API_KEY,
            framework_analysis=fa,
            final_script=fs,
            report=payload.report,
            angle_title=payload.angle_title,
            angle_raw=payload.angle_raw,
            extra_style_prompt=payload.extra_style_prompt,
            model_name=payload.model_name,
        )
        text = out.get("shotlist_text") or ""
        if not text.strip():
            from app.services.gemini import _heuristic_tsv_from_script
            text = _heuristic_tsv_from_script(fs)

        return GenerateShotlistResponse(
            step="shotlist_done",
            model=out.get("model") or payload.model_name or DEFAULT_TEXT_MODEL,
            shotlist_text=text,
            beats=[],  # FE sẽ parse TSV
        )
    except Exception:
        from app.services.gemini import _heuristic_tsv_from_script
        text = _heuristic_tsv_from_script(fs)
        return GenerateShotlistResponse(
            step="shotlist_done",
            model=payload.model_name or DEFAULT_TEXT_MODEL,
            shotlist_text=text,
            beats=[],
        )
