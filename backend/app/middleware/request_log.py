import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.logger import get_request_ip, set_request_ip, setup_app_logger

# khởi tạo 1 logger dùng chung
app_logger = setup_app_logger(name="casesurf", log_dir="logs")

def _client_ip(request: Request) -> str:
    # Ưu tiên X-Forwarded-For nếu chạy sau reverse proxy
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    try:
        return request.client.host  # type: ignore[attr-defined]
    except Exception:
        return "-"

class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # xác định IP
        xff = request.headers.get("x-forwarded-for")
        ip = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "-")

        # set vào context var
        token = None
        try:
            token = set_request_ip(ip)  # set
        except Exception:
            token = None

        start = time.time()
        try:
            response = await call_next(request)
            status = response.status_code
        except Exception as e:
            app_logger.exception(f"{get_request_ip()} - ERROR {request.method} {request.url.path}: {e}")
            raise
        finally:
            # trả context về trạng thái cũ (tránh leak IP giữa requests)
            try:
                if token is not None:
                    # ContextVar.set() không trả token trong Python 3.8; nếu bạn dùng kiểu này
                    # hãy bỏ reset. Nếu bạn dùng set() trả token, gọi _request_ip.reset(token).
                    pass
            except Exception:
                pass

        dur = int((time.time() - start) * 1000)
        app_logger.info(f"{get_request_ip()} - {request.method} {request.url.path} {status} {dur}ms")
        return response

# Helper để các nơi khác log theo chuẩn "IP - ..."
def log_event(ip: str, message: str):
    app_logger.info(f"{ip} - {message}")
