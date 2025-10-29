# app/core/config.py
from functools import lru_cache
import os, json
from pathlib import Path
from typing import List, Optional, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "CaseSurf2 API"
    DEBUG: bool = False
    ROOT_PATH: str = os.getenv("ROOT_PATH", "/api")          # public root (bên ngoài)
    API_PREFIX: str = "/api"

    BASE_DIR: Path = Path(__file__).resolve().parents[2]
    UPLOAD_DIR: Path = Path("uploads")
    STATIC_DIR: Path = Path(os.getenv("STATIC_DIR", str(BASE_DIR / "static"))).resolve()
    STATIC_URL_PREFIX: str = os.getenv("STATIC_URL_PREFIX", "/static")


    MAX_UPLOAD_SIZE_MB: int = 1024
    N8N_TIMEOUT_SEC: int = 120
    OUTBOUND_TIMEOUT_SEC: int = 90

    # --- CORS ---
    CORS_ORIGINS: List[str] = ["*"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors(cls, v):
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return []
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                return [x.strip() for x in s.split(",") if x.strip()]
        return v

    # --- External URLs ---
    N8N_URL_REPORT: Optional[AnyHttpUrl] = None
    N8N_URL_LANDING: Optional[AnyHttpUrl] = None
    N8N_URL_SCRIPT: Optional[AnyHttpUrl] = None
    N8N_URL_HOOK: Optional[AnyHttpUrl] = None

    # --- Gemini ---
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL_REPORT: str = "gemini-2.5-flash"
    GEMINI_MODEL_LANDING: str = "gemini-2.5-flash"
    GEMINI_MODEL_SCRIPT: str = "gemini-2.5-flash"
    GEMINI_MODEL_VISION: str = "gemini-2.5-flash"
    GEMINI_MODEL_TEXT: str = "gemini-2.5-flash"
    VERTEX_API_KEY: str = ""

    # --- Base URL ---
    PUBLIC_BASE_URL: Union[AnyHttpUrl, str] = os.getenv("PUBLIC_BASE_URL", "")


    # --- ElevenLabs ---
    ELEVENLABS_API_KEY: str = ""

    # ================= Helpers =================
    def base_url_str(self) -> str:
        return str(self.PUBLIC_BASE_URL or "").rstrip("/")

    def _normalize_segment(self, s: str) -> str:
        return (s or "").strip().strip("/")

    def static_public_prefix(self) -> str:
        """
        Public prefix cho STATIC:
        - Nếu đặt ROOT_PATH="/api" và STATIC_URL_PREFIX="/static" -> "/api/static"
        - Nếu ROOT_PATH="" (không dùng), -> "/static"
        """
        root = self._normalize_segment(self.ROOT_PATH)
        static_prefix = "/" + self._normalize_segment(self.STATIC_URL_PREFIX)
        # nếu root rỗng -> "/static"; ngược lại -> "/{root}/static"
        return (f"/{root}{static_prefix}" if root else static_prefix)

    def static_url(self, *path: str, filename: Optional[str] = None) -> str:
        """
        Build URL public (client dùng).
        Ưu tiên PUBLIC_BASE_URL nếu được cấu hình (ví dụ domain).
        Ví dụ:
          - "/api/static/video/abc.mp4" (nếu ROOT_PATH="/api")
          - "/static/video/abc.mp4" (nếu ROOT_PATH="")
        """
        tail_parts = [self._normalize_segment(p) for p in path if p]
        if filename:
            tail_parts.append(self._normalize_segment(filename))
        tail = "/".join([p for p in tail_parts if p])

        prefix = self.static_public_prefix().rstrip("/")
        rel_path = f"{prefix}/{tail}" if tail else f"{prefix}/"

        base = self.base_url_str()
        return f"{base}{rel_path}" if base else rel_path

    def static_file_path(self, *path: str, filename: Optional[str] = None) -> Path:
        """
        Đường dẫn vật lý để lưu static.
        Tự đảm bảo thư mục cha tồn tại.
        """
        segs = [p for p in path if p]
        p = self.STATIC_DIR.joinpath(*segs)
        p.mkdir(parents=True, exist_ok=True)
        return p / filename if filename else p

    def ensure_dirs(self) -> None:
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        self.STATIC_DIR.mkdir(parents=True, exist_ok=True)
        (self.STATIC_DIR / "tts").mkdir(parents=True, exist_ok=True)
        (self.STATIC_DIR / "video").mkdir(parents=True, exist_ok=True)

@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.ensure_dirs()
    return s


settings = get_settings()
