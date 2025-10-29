from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class AngleFull(BaseModel):
    number: Optional[int] = None
    title: str = ""
    raw: Optional[str] = ""