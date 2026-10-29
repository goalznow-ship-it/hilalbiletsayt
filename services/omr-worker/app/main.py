from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.config import settings
from app.api.processing import router as processing_router
from app.api.worker_auth import WorkerAuth

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.include_router(health_router, prefix="/api")
app.add_middleware(WorkerAuth)
app.include_router(processing_router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": settings.app_name, "status": "running"}
