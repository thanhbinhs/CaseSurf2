from typing import Any, Dict, Optional
from pydantic import BaseModel


class TTSRequest(BaseModel):
    text: str
    beat: Optional[str] = None
    style_hints: Optional[Dict[str, Any]] = None
    voice_id: Optional[str] = None
    model_id: Optional[str] = None
    output_format: Optional[str] = "mp3_44100_128"
    stability: Optional[float] = None
    similarity_boost: Optional[float] = None
    style: Optional[float] = None
    use_speaker_boost: Optional[bool] = None


class TTSResponse(BaseModel):
    audio_url: str
    beat: Optional[str] = None
    voice_id: str
    model_id: str
    bytes: int
    duration_seconds: Optional[float] = None
    sample_rate_hz: Optional[int] = None