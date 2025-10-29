import os, time, re, io
from pathlib import Path
from typing import Optional, Dict, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from mutagen import File as MutagenFile

from app.core.config import get_settings

router = APIRouter()

# ---- Local schemas -----------------------------------------------------------
class TTSRequest(BaseModel):
    text: str
    beat: Optional[str] = None
    style_hints: Optional[Dict[str, Any]] = None  # { pacing, annotation, primary_ost }
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

# ---- Local helpers -----------------------------------------------------------
def _safe_text(s: str) -> str:
    return (s or "").strip()

def _strip_sfx_from_vo(vo: str) -> str:
    if not vo:
        return vo
    patterns = [
        r"\[sfx:[^\]]*\]", r"\(sfx:[^\)]*\)", r"\{sfx:[^\}]*\}",
        r"\[fx:[^\]]*\]",  r"\(fx:[^\)]*\)",  r"\{fx:[^\}]*\}",
        r"\[sound:[^\]]*\]", r"\(sound:[^\)]*\)", r"\{sound:[^\}]*\}",
    ]
    out = vo
    for p in patterns:
        out = re.sub(p, "", out, flags=re.IGNORECASE)
    out = re.sub(r"\s{2,}", " ", out).strip()
    return out

def _probe_mp3_duration_seconds(raw: bytes) -> Optional[float]:
    try:
        f = MutagenFile(io.BytesIO(raw))
        if f and getattr(f, "info", None):
            return float(f.info.length)
    except Exception:
        pass
    return None

def _sample_rate_from_output_format(output_format: str) -> Optional[int]:
    m = re.search(r"mp3_(\d{4,6})_", output_format or "")
    return int(m.group(1)) if m else None

def _ensure_dir(path: Path) -> Path:
    if path.exists() and not path.is_dir():
        raise NotADirectoryError("Path exists and is not a directory: {}".format(path))
    path.mkdir(parents=True, exist_ok=True)
    return path

# ---- Route -------------------------------------------------------------------
@router.post("/generate-voice", response_model=TTSResponse)
async def generate_voice(payload: TTSRequest, settings=Depends(get_settings)):
    api_key = getattr(settings, "ELEVENLABS_API_KEY", None) or os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing ELEVENLABS_API_KEY (server config).")

    raw_vo = _safe_text(payload.text)
    if not raw_vo:
        raise HTTPException(status_code=400, detail="Thiếu text.")
    if len(raw_vo) > 2500:
        raise HTTPException(status_code=413, detail="Text quá dài cho 1 beat (tối đa ~2500 ký tự). Hãy chia nhỏ.")

    tts_text = _strip_sfx_from_vo(raw_vo)

    voice_id = payload.voice_id or getattr(settings, "ELEVENLABS_VOICE_ID", "cgSgspJ2msm6clMCkdW9")
    model_id = payload.model_id or getattr(settings, "ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
    output_format = payload.output_format or "mp3_44100_128"

    vs = {
        "stability": payload.stability if payload.stability is not None else 0.5,
        "similarity_boost": payload.similarity_boost if payload.similarity_boost is not None else 0.7,
        "style": payload.style if payload.style is not None else 0.2,
        "use_speaker_boost": True if payload.use_speaker_boost is None else bool(payload.use_speaker_boost),
    }

    tts_url = "https://api.elevenlabs.io/v1/text-to-speech/{}".format(voice_id)
    headers = {
        "accept": "audio/mpeg",
        "content-type": "application/json",
        "xi-api-key": api_key,
    }
    params = {"optimize_streaming_latency": 0, "output_format": output_format}
    body = {"text": tts_text, "model_id": model_id, "voice_settings": vs}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(tts_url, headers=headers, params=params, json=body)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail="Không gọi được ElevenLabs: {}".format(e))

    if resp.status_code >= 400:
        try:
            err_detail = resp.json()
        except Exception:
            err_detail = resp.text
        raise HTTPException(status_code=502, detail="ElevenLabs error: {}".format(err_detail))

    audio_bytes = resp.content
    if not audio_bytes:
        raise HTTPException(status_code=502, detail="ElevenLabs trả về rỗng.")

    duration_seconds = _probe_mp3_duration_seconds(audio_bytes)
    sample_rate_hz = _sample_rate_from_output_format(output_format)

    static_dir = Path(getattr(settings, "STATIC_DIR", "static"))
    out_dir = static_dir / "tts"
    _ensure_dir(out_dir)

    filename = "{}-{}-{}.mp3".format(
        int(time.time() * 1000),
        (payload.beat or "beat").replace("/", "-").replace(" ", ""),
        os.urandom(4).hex(),
    )
    out_path = out_dir / filename
    out_path.write_bytes(audio_bytes)

    base_url = getattr(settings, "PUBLIC_BASE_URL", None) or os.getenv("PUBLIC_BASE_URL")
    rel_path = "/api/static/tts/{}".format(filename)
    audio_url = (base_url.rstrip("/") + rel_path) if base_url else rel_path

    return TTSResponse(
        audio_url=audio_url,
        beat=payload.beat,
        voice_id=voice_id,
        model_id=model_id,
        bytes=len(audio_bytes),
        duration_seconds=duration_seconds,
        sample_rate_hz=sample_rate_hz,
    )
