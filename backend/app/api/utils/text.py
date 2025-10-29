import re

def safe_text(s):
    return (s or "").strip()


def strip_sfx_from_vo(vo):
    if not vo:
        return vo
    patterns = [
        r"\[sfx:[^\]]*\]", r"\(sfx:[^\)]*\)", r"\{sfx:[^\}]*\}",
        r"\[fx:[^\]]*\]", r"\(fx:[^\)]*\)", r"\{fx:[^\}]*\}",
        r"\[sound:[^\]]*\]", r"\(sound:[^\)]*\)", r"\{sound:[^\}]*\}",
    ]
    out = vo
    for p in patterns:
        out = re.sub(p, "", out, flags=re.IGNORECASE)
        out = re.sub(r"\s{2,}", " ", out).strip()
    return out


def slugify(value):
    value = str(value).strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "-", value)
    value = re.sub(r"-{2,}", "-", value)
    return value.strip("-") or "file"


def constraint_block(*lines):
    lines = ["- {}".format(x) for x in lines if x and str(x).strip()]
    return "[CONSTRAINT]\n" + "\n".join(lines) + "\n\n" if lines else ""