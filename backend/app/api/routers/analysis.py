from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path
import os, re, mimetypes

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Request
from starlette import status
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.logger import setup_app_logger  # ⬅️ dùng logger xoay file theo ngày
from app.services.gemini import (
    gemini_upload_file,
    gemini_generate_video_report,
    gemini_generate_landing_analysis,
    split_angles_output,
    extract_angles_from_block,
    DEFAULT_TEXT_MODEL,
    DEFAULT_VISION_MODEL,
)

router = APIRouter()

# ---- Logger ------------------------------------------------------------------
_app_logger = setup_app_logger(name="casesurf", log_dir="logs")

def _log(ip: str, message: str) -> None:
    # Mọi dòng đều theo format "IP - message"
    _app_logger.info(f"{ip} - {message}")

def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    try:
        return request.client.host  # type: ignore[attr-defined]
    except Exception:
        return "-"

# ---- Local helpers (self-contained) -----------------------------------------
def _ensure_dir(path: Path) -> Path:
    if path.exists() and not path.is_dir():
        raise NotADirectoryError("Path exists and is not a directory: {}".format(path))
    path.mkdir(parents=True, exist_ok=True)
    return path

def _save_upload(f: UploadFile, dest_dir: Path, max_mb: int) -> Tuple[Path, int, str]:
    name = f.filename or "upload.bin"
    ext = "".join(Path(name).suffixes) or ".bin"
    safe_base = re.sub(r"[^a-zA-Z0-9_-]+", "-", Path(name).stem) or "file"
    stored = dest_dir / "{}-{}{}".format(safe_base, os.urandom(4).hex(), ext)
    _ensure_dir(dest_dir)

    size = 0
    with open(stored, "wb") as out:
        while True:
            chunk = f.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_mb * 1024 * 1024:
                out.close()
                try:
                    stored.unlink()
                except Exception:
                    pass
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File quá lớn")
            out.write(chunk)

    mime = f.content_type or mimetypes.guess_type(str(stored))[0] or "application/octet-stream"
    return stored, size, mime

# ---- Local schemas (để file tự chạy độc lập) --------------------------------
class AngleFull(BaseModel):
    number: Optional[int] = None
    title: str = ""
    raw: Optional[str] = ""

class LandingAnalysisResponse(BaseModel):
    step: str = "landing_done"
    landing_analysis: str
    angles_text: str
    angles: List[str]
    angles_full: Optional[List[AngleFull]] = None
    angles_store: Optional[Dict[str, Any]] = None

# ---- Constants ---------------------------------------------------------------
ALLOWED_VIDEO = {
    "video/mp4",
    "video/quicktime",
    "video/x-matroska",
    "video/webm",
    "video/x-msvideo",
}
MAX_MB = 300

# ---- Routes -----------------------------------------------------------------
@router.post("/analysis-report")
async def analysis_report(
    request: Request,
    video: UploadFile = File(...),
    message: str = Form(""),
    userId: str = Form("anon"),
    projectId: str = Form("default"),
    settings=Depends(get_settings),
):
    ip = _client_ip(request)
    _log(ip, f"START /analysis-report userId={userId} projectId={projectId} file={getattr(video,'filename',None)}")

    stored_path, size_bytes, mime = _save_upload(video, settings.UPLOAD_DIR, MAX_MB)
    _log(ip, f"UPLOAD_SAVED path={stored_path.name} size={size_bytes} mime={mime}")

    if mime not in ALLOWED_VIDEO:
        try:
            stored_path.unlink()
        except Exception:
            pass
        _log(ip, f"UNSUPPORTED_MEDIA mime={mime}")
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Định dạng video không hỗ trợ: {}".format(mime))

    try:
        _log(ip, "GEMINI_UPLOAD start")
        uploaded_file = await gemini_upload_file(
            api_key=settings.GEMINI_API_KEY,
            file_path=str(stored_path),
        )
        _log(ip, "GEMINI_UPLOAD ok")

        _log(ip, "GEMINI_VIDEO_REPORT start")
        report_text, _ = await gemini_generate_video_report(
            api_key=settings.GEMINI_API_KEY,
            uploaded_file=uploaded_file,
            user_prompt=message or "",
            model_name=getattr(settings, "GEMINI_MODEL_VISION", DEFAULT_VISION_MODEL),
        )
        _log(ip, "GEMINI_VIDEO_REPORT ok")
    except Exception as e:
        _log(ip, f"ERROR /analysis-report: {e}")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Lỗi xử lý video từ Gemini: {}".format(e))
    finally:
        try:
            stored_path.unlink()
            _log(ip, f"TEMP_CLEANED path={stored_path.name}")
        except Exception as _e:
            _log(ip, f"TEMP_CLEAN_FAIL path={stored_path} err={_e}")

    _log(ip, "END /analysis-report success")
    return {
        "step": "report_done",
        "report": report_text,  # RAW markdown
        "options": {"create_script": True, "analyze_landing_page": True},
    }

@router.post("/analysis-landing-page", response_model=LandingAnalysisResponse)
async def analysis_landing_page(
    request: Request,
    landingUrl: str = Form(...),
    userId: str = Form("unknown"),
    projectId: str = Form("default"),
    settings=Depends(get_settings),
):
    ip = _client_ip(request)
    page_text = (landingUrl or "").strip()

    _log(ip, f"START /analysis-landing-page userId={userId} projectId={projectId} len={len(page_text)}")

    if not page_text:
        _log(ip, "BAD_REQUEST landingUrl empty")
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Thiếu nội dung landing để phân tích (landingUrl trống).",
        )

    try:
        _log(ip, "GEMINI_LANDING_ANALYSIS start")
        analysis_text, angles_raw, _meta = await gemini_generate_landing_analysis(
            api_key=settings.GEMINI_API_KEY,
            page_text=page_text,
            user_prompt="",
            model_name=getattr(settings, "GEMINI_MODEL_TEXT", DEFAULT_TEXT_MODEL),
        )
        _log(ip, "GEMINI_LANDING_ANALYSIS ok")

        analysis_text = (analysis_text or "").strip()
        angles_raw = (angles_raw or "").strip()

        framework_table, angles_block = split_angles_output(angles_raw)
        titles, full = extract_angles_from_block(angles_block)
        _log(ip, f"ANGLES_PARSED titles={len(titles or [])} full={len(full or [])}")
    except Exception as e:
        _log(ip, f"ERROR /analysis-landing-page: {e}")
        raise

    _log(ip, "END /analysis-landing-page success")
    return LandingAnalysisResponse(
        landing_analysis=analysis_text,
        angles_text=angles_block,
        angles=titles or [],
        angles_full=[AngleFull(**x) for x in full] if full else None,
        angles_store={"framework_table": framework_table} if framework_table else None,
    )
