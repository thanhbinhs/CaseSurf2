from typing import List
from pydantic import BaseModel


class ShotBeat(BaseModel):
    beat: str
    vo: str
    primary_ost: str
    annotation: str
    pacing: str
    prompt: str


class GenerateShotlistRequest(BaseModel):
    framework_analysis: str
    final_script: str
    report: str = ""
    angle_title: str = ""
    angle_raw: str = ""
    extra_style_prompt: str = ""
    model_name: str = ""


class GenerateShotlistResponse(BaseModel):
    step: str
    model: str
    shotlist_text: str
    beats: List[ShotBeat]