import os, re, mimetypes
from pathlib import Path
from typing import Tuple
from fastapi import UploadFile, HTTPException
from starlette import status


MAX_MB_DEFAULT = 300


def ensure_dir(path: Path) -> Path:
    p = Path(path)
    if p.exists() and not p.is_dir():
        raise NotADirectoryError("Path exists and is not a directory: {}".format(p))
    p.mkdir(parents=True, exist_ok=True)
    return p


def save_upload(f: UploadFile, dest_dir: Path, max_mb: int = MAX_MB_DEFAULT) -> Tuple[Path, int, str]:
    name = f.filename or "upload.bin"
    ext = "".join(Path(name).suffixes) or ".bin"
    safe_base = re.sub(r"[^a-zA-Z0-9_-]+", "-", Path(name).stem) or "file"
    stored = dest_dir / ("{}-{}{}".format(safe_base, os.urandom(4).hex(), ext))
    ensure_dir(dest_dir)


    size = 0
    with open(stored, "wb") as out:
        while True:
            chunk = f.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_mb * 1024 * 1024:
                out.close()
                try:
                    stored.unlink()
                except Exception:
                    pass
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File quá lớn")
            out.write(chunk)
    mime = f.content_type or mimetypes.guess_type(str(stored))[0] or "application/octet-stream"
    return stored, size, mime