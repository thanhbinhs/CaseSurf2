# app/main.py
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, JSONResponse

from app.core.config import get_settings
from app.api import router as api_router
from app.middleware.request_log import RequestLogMiddleware

settings = get_settings()  # đọc .env, ensure_dirs() đã được gọi bên trong

app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
    root_path="/api"
)

# -----------------------------
# CORS
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Static mounts
# -----------------------------
# Mount static theo cấu hình (ví dụ /static hoặc /api/static)
# Mount static/ uploads ở GỐC (nội bộ)
app.mount("/static", StaticFiles(directory=str(settings.STATIC_DIR)), name="static")
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")

# -----------------------------
# Routers
# -----------------------------
# Router chính của API (prefix cấu hình được, mặc định /api)
app.include_router(api_router)

# bật middleware log
app.add_middleware(RequestLogMiddleware)
# -----------------------------
# Utility endpoints
# -----------------------------
@app.get("/", include_in_schema=False)
def root():
    """
    Trang chủ đơn giản: điều hướng về /docs.
    """
    return RedirectResponse(url="/docs")

@app.get("/healthz", tags=["system"])
def health():
    """
    Endpoint kiểm tra tình trạng service.
    """
    return JSONResponse({"ok": True, "name": settings.APP_NAME})

@app.get("/version", tags=["system"])
def version():
    """
    Cho FE biết cấu hình static đang dùng (hữu ích để debug 404).
    """
    return {
        "app": settings.APP_NAME,
        "debug": settings.DEBUG,
        "api_prefix": settings.API_PREFIX,
        "static_url_prefix": settings.STATIC_URL_PREFIX,
        "public_base_url": str(settings.PUBLIC_BASE_URL),
    }
