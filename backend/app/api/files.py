from __future__ import annotations
from pathlib import Path
from typing import Tuple
from fastapi import HTTPException, UploadFile
from slugify import slugify
import mimetypes, uuid

def save_upload(f: UploadFile, dest_dir: Path, max_mb: int) -> Tuple[Path, int, str]:
    """
    Lưu stream file vào dest_dir. Trả về (stored_path, size_bytes, mime).
    """
    dest_dir.mkdir(parents=True, exist_ok=True)

    base = (f.filename or "").rsplit(".", 1)[0]
    ext = ("." + (f.filename or "").rsplit(".", 1)[-1]) if "." in (f.filename or "") else ""
    safe = slugify(base) or "video"
    uid = uuid.uuid4().hex[:8]
    stored_name = f"{safe}-{uid}{ext.lower()}"
    stored_path = dest_dir / stored_name

    size = 0
    with stored_path.open("wb") as out:
        while True:
            chunk = f.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_mb * 1024 * 1024:
                out.close()
                stored_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File quá lớn")
            out.write(chunk)

    mime = f.content_type or mimetypes.guess_type(str(stored_path))[0] or "application/octet-stream"
    return stored_path, size, mime
