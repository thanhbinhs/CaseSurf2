from __future__ import annotations
import re
from typing import List, Optional, Tuple
from .schemas import AngleFull

# Marker tách 2 phần
_ANALYS_MARK_RE = re.compile(r"^\s*(analys(?:is)?\s*url)\s*:\s*(.*)$", re.IGNORECASE)
_ANGLE_MARK_RE  = re.compile(r"^\s*(angles?|angle)\s*:\s*(.*)$", re.IGNORECASE)

def split_analys_and_angles_from_text(text: str) -> Tuple[str, str]:
    if not text:
        return "", ""
    analysis_buf: List[str] = []
    angles_buf: List[str] = []
    current: Optional[str] = None

    for raw_line in text.replace("\r\n", "\n").split("\n"):
        line = raw_line.rstrip()

        m1 = _ANALYS_MARK_RE.match(line)
        if m1:
            current = "analysis"
            tail = (m1.group(2) or "").strip()
            if tail:
                analysis_buf.append(tail)
            continue

        m2 = _ANGLE_MARK_RE.match(line)
        if m2:
            current = "angles"
            tail = (m2.group(2) or "").strip()
            if tail:
                angles_buf.append(tail)
            continue

        if current == "analysis":
            analysis_buf.append(line)
        elif current == "angles":
            angles_buf.append(line)

    return "\n".join(analysis_buf).strip(), "\n".join(angles_buf).strip()

# Trích angles
_ANGLE_HEAD_RE = re.compile(
    r"^\s*(?:[*\-]+\s*)?(?:Angle|Góc|Concept|Idea)\s*(\d+)?\s*[:\-–]\s*(.+)$",
    re.IGNORECASE | re.MULTILINE,
)
_ANGLE_BOLD_LINE_RE = re.compile(
    r"^\s*(?:\*{2,3})?\s*(?:Angle|Góc)\s*(\d+)?\s*[:\-–]?\s*(.+?)(?:\*{2,3})?\s*$",
    re.IGNORECASE | re.MULTILINE,
)

def _trim_title(s: str, limit: int = 120) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s[:limit]

def _segment_by_matches(text: str, matches: List[Tuple[int, int, str, Optional[int]]]) -> List[Tuple[str, str]]:
    segs: List[Tuple[str, str]] = []
    if not matches:
        return segs
    for i, (s, e, title, num) in enumerate(matches):
        start = e
        stop = matches[i + 1][0] if i + 1 < len(matches) else len(text)
        block = text[start:stop].strip()
        segs.append((title, block))
    return segs

def extract_angles(angles_text: str) -> Tuple[List[str], List[AngleFull]]:
    if not angles_text or not angles_text.strip():
        return [], []
    text = angles_text.replace("\r\n", "\n")

    matches: List[Tuple[int, int, str, Optional[int]]] = []
    for m in _ANGLE_HEAD_RE.finditer(text):
        num = m.group(1)
        title = _trim_title(m.group(2))
        matches.append((m.start(), m.end(), title, int(num) if num else None))
    for m in _ANGLE_BOLD_LINE_RE.finditer(text):
        num = m.group(1)
        title = _trim_title(m.group(2))
        matches.append((m.start(), m.end(), title, int(num) if num else None))

    matches = sorted(set(matches), key=lambda t: t[0])

    if not matches:
        bullets = []
        for line in text.split("\n"):
            if re.search(r"\b(Angle|Góc)\b", line, re.IGNORECASE):
                bullets.append(_trim_title(re.sub(r"^[*\-\d\.\)\s]+", "", line)))
        titles = [b for b in bullets if b]
        return titles, [AngleFull(title=t) for t in titles]

    segments = _segment_by_matches(text, matches)
    angles_full: List[AngleFull] = []
    titles: List[str] = []
    for i, (title, raw_block) in enumerate(segments, start=1):
        titles.append(title)
        angles_full.append(AngleFull(number=i, title=title, raw=(raw_block or "").strip()))
    return titles, angles_full
