# app/api/http_client.py
from __future__ import annotations
from typing import Any, Dict, Optional, Union
from pydantic import AnyHttpUrl
from fastapi import HTTPException
from starlette import status
import httpx
import json as _json

def _try_parse_json(text: str) -> Optional[Dict[str, Any]]:
    try:
        return _json.loads(text)
    except Exception:
        return None

async def post_json(
    url: Union[str, AnyHttpUrl],
    payload: Dict[str, Any],
    timeout_s: float = 60.0,
) -> Dict[str, Any]:
    url = str(url)
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            r = await client.post(url, json=payload)
            # Nếu lỗi HTTP thì ném ngay (để thấy thân lỗi)
            if r.status_code >= 400:
                body = r.text.strip()
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                                    detail=f"n8n upstream error: {r.status_code}. body={body[:800]}")

            # Luôn cố parse JSON, bất kể content-type ghi gì
            text = r.text
            data = _try_parse_json(text)
            if data is not None:
                # giữ raw để debug/fallback
                data.setdefault("_raw_text", text)
                return data

            # Không phải JSON → trả về dạng text
            return {"_text": text}
    except HTTPException:
        raise
    except Exception as e:
        # Network/timeout...
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"n8n upstream error: {type(e).__name__}: {e}")

async def post_multipart_file(
    url: Union[str, AnyHttpUrl],
    data: Optional[Dict[str, Any]] = None,
    files: Optional[Dict[str, Any]] = None,
    timeout_s: float = 120.0,
) -> Dict[str, Any]:
    url = str(url)

    # Đảm bảo form-data chỉ có primitive
    form_data: Dict[str, str] = {}
    for k, v in (data or {}).items():
        if v is None:
            form_data[k] = ""
        elif isinstance(v, (dict, list)):
            form_data[k] = _json.dumps(v, ensure_ascii=False)
        else:
            form_data[k] = str(v)

    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            r = await client.post(url, data=form_data, files=files)
            if r.status_code >= 400:
                body = r.text.strip()
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                                    detail=f"n8n upstream error: {r.status_code}. body={body[:800]}")

            text = r.text
            data = _try_parse_json(text)
            if data is not None:
                data.setdefault("_raw_text", text)
                return data

            return {"_text": text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"n8n upstream error: {type(e).__name__}: {e}")
