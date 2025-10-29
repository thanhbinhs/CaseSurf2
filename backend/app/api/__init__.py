from fastapi import APIRouter
from app.api.routers.analysis import router as analysis_router
from app.api.routers.script import router as script_router
from app.api.routers.shotlist import router as shotlist_router
from app.api.routers.tts import router as tts_router
from app.api.routers.video import router as video_router


router = APIRouter()
router.include_router(analysis_router, tags=["api"])
router.include_router(script_router, tags=["api"])
router.include_router(shotlist_router, tags=["api"])
router.include_router(tts_router, tags=["api"])
router.include_router(video_router, tags=["api"])