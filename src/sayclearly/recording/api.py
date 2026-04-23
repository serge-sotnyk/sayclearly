from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from sayclearly.recording.models import AudioAnalysisMetadata, RecordingAnalysisResult
from sayclearly.recording.service import (
    EmptyRecordingError,
    RecordingAnalysisInvalidCredentialsError,
    RecordingAnalysisProviderError,
    RecordingService,
    RecordingServiceConfigurationError,
)
from sayclearly.storage.files import StorageError


def build_recording_router(data_root: Path | None = None) -> APIRouter:
    service = RecordingService(data_root)
    router = APIRouter()

    @router.post("/api/analyze-recording", response_model=RecordingAnalysisResult)
    async def analyze_recording(
        audio: Annotated[UploadFile, File()],
        metadata: Annotated[str, Form()] = "{}",
    ) -> RecordingAnalysisResult:
        try:
            parsed_metadata = AudioAnalysisMetadata.model_validate_json(metadata)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            audio_bytes = await audio.read()
            return service.analyze_recording(
                audio_bytes=audio_bytes,
                filename=audio.filename,
                content_type=audio.content_type,
                metadata=parsed_metadata,
            )
        except EmptyRecordingError as exc:
            raise HTTPException(status_code=400, detail="") from exc
        except RecordingServiceConfigurationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RecordingAnalysisInvalidCredentialsError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RecordingAnalysisProviderError as exc:
            raise HTTPException(
                status_code=502,
                detail="Analysis is unavailable right now. Please try again.",
            ) from exc
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
