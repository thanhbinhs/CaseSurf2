import io, re
from pathlib import Path
from typing import Optional
from mutagen import File as MutagenFile


def probe_mp3_duration_seconds(raw):
    try:
        f = MutagenFile(io.BytesIO(raw))
        if f and getattr(f, "info", None):
            return float(f.info.length)
    except Exception:
        pass
    return None


def sample_rate_from_output_format(output_format):
    m = re.search(r"mp3_(\d{4,6})_", output_format or "")
    return int(m.group(1)) if m else None