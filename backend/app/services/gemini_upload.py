# app/services/gemini_upload.py
import httpx, json, uuid, mimetypes
from typing import Optional

GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files"

async def gemini_upload_file(
    api_key: str,
    file_path: str,
    display_name: Optional[str] = None,   # ✅ thêm tham số
    mime_type: Optional[str] = None,
) -> dict:
    """
    Upload file lên Gemini Files API bằng multipart/related.
    Trả về JSON resource (có thể chứa file.uri).
    """
    mime_type = mime_type or (mimetypes.guess_type(file_path)[0] or "application/octet-stream")
    boundary = "====" + uuid.uuid4().hex

    meta = {
        "file": {
            "display_name": display_name or file_path.split("/")[-1],
            "mime_type": mime_type,
        }
    }
    meta_bytes = json.dumps(meta, ensure_ascii=False).encode("utf-8")

    with open(file_path, "rb") as fh:
        binary = fh.read()

    # multipart/related (khác multipart/form-data)
    # Part 1: JSON metadata
    # Part 2: binary media
    lines = []
    b = f"--{boundary}\r\n".encode()
    e = f"\r\n--{boundary}--\r\n".encode()

    # JSON part
    lines.append(b)
    lines.append(b"Content-Type: application/json; charset=UTF-8\r\n\r\n")
    lines.append(meta_bytes)
    lines.append(b"\r\n")

    # Media part
    lines.append(b)
    lines.append(f"Content-Type: {mime_type}\r\n\r\n".encode())
    lines.append(binary)
    lines.append(e)

    body = b"".join(lines)

    params = {"uploadType": "multipart", "key": api_key}
    headers = {
        "Content-Type": f"multipart/related; boundary={boundary}",
        "X-Goog-Upload-Protocol": "multipart",
    }

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(GEMINI_UPLOAD_URL, params=params, headers=headers, content=body)
        if r.status_code >= 400:
            raise RuntimeError(f"Gemini upload error {r.status_code}: {r.text}")
        return r.json()
