"""Authenticate before multipart parsing; refuse unbounded chunked requests."""
import hmac
import os
from starlette.responses import JSONResponse
from starlette.exceptions import HTTPException


class WorkerAuth:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith("/api/omr"):
            secret = os.environ.get("OMR_WORKER_SECRET", "")
            headers = dict(scope["headers"])
            supplied = headers.get(b"authorization", b"").decode("latin1")
            if len(secret) < 32 or not hmac.compare_digest(supplied, "Bearer " + secret):
                return await JSONResponse({"detail": "Unauthorized"}, status_code=401)(scope, receive, send)
            try:
                length = int(headers.get(b"content-length", b""))
            except ValueError:
                length = -1
            if not 0 <= length <= 51 * 1024 * 1024:
                return await JSONResponse({"detail": "Request size limit"}, status_code=413)(scope, receive, send)
            receive = limited_receive_wrapper(receive, length)
        await self.app(scope, receive, send)


def limited_receive_wrapper(original, length):
    consumed = 0
    async def limited():
        nonlocal consumed
        message = await original()
        consumed += len(message.get("body", b""))
        if consumed > length:
            raise HTTPException(413, "Request length mismatch")
        return message
    return limited
