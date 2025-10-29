# app/services/gemini_generate.py
import httpx, json

GEMINI_GEN_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent"

async def gemini_generate_from_video(
    api_key: str,
    file_uri: str,
    user_prompt: str,
) -> dict:
    """
    Gọi generateContent, truyền file qua fileData.fileUri + text prompt.
    """
    params = {"key": api_key}
    body = {
        "contents": [{
            "role": "user",
            "parts": [
                {"fileData": {"fileUri": file_uri, "mimeType": "video/mp4"}},
                {"text": user_prompt or "Analyze this video and provide a concise, actionable report."}
            ]
        }],
        # tùy chỉnh
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 2048
        }
    }
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post(GEMINI_GEN_URL, params=params, json=body)
        if r.status_code >= 400:
            raise RuntimeError(f"Gemini generate error {r.status_code}: {r.text}")
        return r.json()

def extract_text_from_candidates(resp: dict) -> str:
    """Ráp text từ candidates -> output gọn."""
    cands = (resp or {}).get("candidates") or []
    if not cands:
        return ""
    parts = (cands[0].get("content") or {}).get("parts") or []
    texts = []
    for p in parts:
        t = p.get("text")
        if t:
            texts.append(t)
    return "\n".join(texts).strip()
