from typing import Dict


def map_hints_to_voice_settings(style_hints):
    vs = {
        "stability": 0.5,
        "similarity_boost": 0.7,
        "style": 0.2,
        "use_speaker_boost": True,
    }
    if not style_hints:
        return vs

    pacing = str(style_hints.get("pacing", "") or "").lower()


    if any(k in pacing for k in ["nhanh", "fast", "quick", "rapid"]):
        vs.update({"stability": 0.35, "similarity_boost": 0.6, "style": 0.45})
    if any(k in pacing for k in ["chậm", "slow"]):
        vs.update({"stability": 0.65, "similarity_boost": 0.7, "style": 0.15})
    if any(k in pacing for k in ["nhấn", "emphasis", "dramatic", " mạnh "]):
        vs["style"] = 0.5
    return vs