"""
Система структурированного логирования для мониторинга.
"""
import json
import time
import logging
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


class StructuredLogger:
    """JSON-логирование запросов и ошибок."""

    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter('%(message)s'))
        if not self.logger.handlers:
            self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)

    def log_request(self, method: str, path: str, status: int, duration: float, client: str):
        log = {
            "timestamp": time.time(),
            "method": method,
            "path": path,
            "status": status,
            "duration_ms": round(duration * 1000, 2),
            "client": client,
            "type": "request"
        }
        self.logger.info(json.dumps(log))

    def log_error(self, error: str, path: str, traceback: str = ""):
        log = {
            "timestamp": time.time(),
            "path": path,
            "error": error,
            "traceback": traceback,
            "type": "error"
        }
        self.logger.error(json.dumps(log))


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Мониторинг времени ответа API."""

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.logger = StructuredLogger("api.performance")

    async def dispatch(self, request: Request, call_next: Callable):
        start = time.time()
        response = await call_next(request)
        duration = time.time() - start

        self.logger.log_request(
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration=duration,
            client=request.client.host if request.client else "unknown"
        )

        response.headers["X-Process-Time"] = str(round(duration * 1000, 2))
        return response
