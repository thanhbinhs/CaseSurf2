import logging
from pathlib import Path
from datetime import date
from contextvars import ContextVar

_request_ip: ContextVar[str] = ContextVar("request_ip", default="-")

class DailyFileHandler(logging.Handler):
    """
    Ghi log vào logs/YYYY-MM-DD.log.
    Mỗi khi sang ngày mới -> tự mở file mới.
    """
    def __init__(self, log_dir: str = "logs"):
        super().__init__()
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.current_date = None  # type: str
        self.stream = None

    def _rollover_if_needed(self):
        today = date.today().isoformat()  # 'YYYY-MM-DD'
        if self.current_date != today:
            if self.stream:
                try:
                    self.stream.close()
                except Exception:
                    pass
            self.current_date = today
            file_path = self.log_dir / f"{today}.log"
            # mở ở chế độ append + utf-8
            self.stream = open(str(file_path), "a", encoding="utf-8")

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._rollover_if_needed()
            msg = self.format(record)
            self.stream.write(msg + "\n")
            self.stream.flush()
        except Exception:
            self.handleError(record)

    def close(self):
        try:
            if self.stream:
                self.stream.close()
        finally:
            super().close()

def set_request_ip(ip: str) -> None:
    try:
        _request_ip.set((ip or "-").strip() or "-")
    except Exception:
        _request_ip.set("-")

def get_request_ip() -> str:
    try:
        return _request_ip.get()
    except Exception:
        return "-"

def setup_app_logger(name: str = "casesurf", log_dir: str = "logs", level: int = logging.INFO) -> logging.Logger:
    """
    Tạo logger ghi vào logs/YYYY-MM-DD.log, format: "YYYY-MM-DD HH:MM:SS IP - log"
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)
    # không nhân đôi handler
    if not any(isinstance(h, DailyFileHandler) for h in logger.handlers):
        handler = DailyFileHandler(log_dir)
        fmt = logging.Formatter("%(asctime)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
        handler.setFormatter(fmt)
        logger.addHandler(handler)
    logger.propagate = False
    return logger

