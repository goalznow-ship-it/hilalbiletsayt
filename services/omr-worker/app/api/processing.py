from typing import Annotated
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, ConfigDict
from app.omr.supervisor import run_bounded, WorkerBusy

router = APIRouter(prefix="/omr", tags=["omr"])


class SheetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    token: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")
    questionCount: int = Field(ge=1, le=150)
    choiceCount: int = Field(ge=2, le=5)
    exam: str = Field(min_length=1, max_length=100)
    variant: str = Field(pattern=r"^[A-Z0-9_-]{1,16}$")
    ticket: str = Field(min_length=1, max_length=100)
    candidate: str = Field(min_length=1, max_length=100)


async def execute(operation, args):
    try:
        return await run_in_threadpool(run_bounded, operation, args)
    except WorkerBusy as exc:
        raise HTTPException(503, "WORKER_BUSY", headers={"Retry-After": "5"}) from exc
    except RuntimeError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/sheets")
async def generate_sheet(request: SheetRequest):
    data = await execute("generate", request.model_dump())
    return Response(data, media_type="application/pdf", headers={"Cache-Control": "no-store"})


@router.post("/process")
async def process_files(files: Annotated[list[UploadFile], File()]):
    try:
        if not 1 <= len(files) <= 4:
            raise HTTPException(413, "BATCH_FILE_LIMIT")
        batch, size = [], 0
        for file in files:
            data = await file.read(25 * 1024 * 1024 + 1)
            size += len(data)
            if len(data) > 25 * 1024 * 1024 or size > 50 * 1024 * 1024:
                raise HTTPException(413, "UPLOAD_SIZE_LIMIT")
            batch.append((data, file.filename or "", file.content_type or ""))
        return {"files": await execute("process", batch)}
    finally:
        for file in files:
            await file.close()
