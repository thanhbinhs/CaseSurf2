from typing import Dict, Optional
from pydantic import BaseModel, HttpUrl


class VideoReq(BaseModel):
    prompt: str
    beat: Optional[str] = None
    vo_url: Optional[HttpUrl] = None
    vo_text: Optional[str] = None
    duration_seconds: Optional[int] = None
    overlay_text: Optional[str] = None
    annotation: Optional[str] = None
    pacing: Optional[str] = None
    aspect_ratio: Optional[str] = None
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