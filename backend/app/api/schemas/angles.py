from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from app.api.schemas import AngleFull


class LandingAnalysisResponse(BaseModel):
    step: str = "landing_done"
    landing_analysis: str
    angles_text: str
    angles: List[str]
    angles_full: Optional[List[AngleFull]] = None
    angles_store: Optional[Dict[str, Any]] = None