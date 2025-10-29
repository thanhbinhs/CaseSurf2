from typing import Any, Dict, Optional
import httpx
from fastapi import HTTPException, status
from app.core.config import settings

async def handle_message(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    payload: dict gồm userId, projectId, message, images?, meta?
    Trả về dict có 'reply' và meta (tuỳ chọn)
    """
    # 1) Nếu có N8N_WEBHOOK_URL → forward sang n8n
    if settings.N8N_WEBHOOK_URL:
        try:
            async with httpx.AsyncClient(timeout=settings.OUTBOUND_TIMEOUT_SEC) as client:
                r = await client.post(settings.N8N_WEBHOOK_URL, json=payload)
                r.raise_for_status()
                data = r.json()
                # Chuẩn hoá output
                return {
                    "reply": data.get("reply", "(no content)"),
                    "meta": data.get("meta", {"via": "n8n"})
                }
        except httpx.HTTPError as e:
            # Trả lỗi 502 khi upstream (n8n/LLM) có vấn đề
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                                detail=f"Upstream error: {e}") from e

    # 2) Nếu không forward, xử lý nội bộ (demo: echo)
    message = (payload.get("message") or "").strip()
    if not message:
        return {"reply": "Bạn chưa nhập tin nhắn.", "meta": {"via": "local"}}
    return {"reply": f"Echo: {message}", "meta": {"via": "local"}}