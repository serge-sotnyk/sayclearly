from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile

from sayclearly.recording.models import RecordingAnalysisResponse
from sayclearly.recording.service import EmptyRecordingError, RecordingService
from sayclearly.storage.files import StorageError


def build_recording_router(data_root: Path | None = None) -> APIRouter:
    service = RecordingService(data_root)
    router = APIRouter()

    @router.post("/api/analyze-recording", response_model=RecordingAnalysisResponse)
    async def analyze_recording(
        audio: Annotated[UploadFile, File()],
    ) -> RecordingAnalysisResponse:
        try:
            audio_bytes = await audio.read()
            return service.analyze_recording(
                audio_bytes=audio_bytes,
                filename=audio.filename,
                content_type=audio.content_type,
            )
        except EmptyRecordingError as exc:
            raise HTTPException(status_code=400, detail="") from exc
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
