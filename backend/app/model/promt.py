from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class ChatIn(BaseModel):
    message: str
    userId: str | None = None
    meta: dict | None = None