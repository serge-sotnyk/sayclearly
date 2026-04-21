from pathlib import Path

from fastapi import APIRouter, HTTPException

from sayclearly.exercise.models import (
    ExerciseGenerationRequest,
    ExerciseGenerationResponse,
)
from sayclearly.exercise.service import ExerciseService
from sayclearly.storage.files import StorageError


def build_exercise_router(data_root: Path | None = None) -> APIRouter:
    service = ExerciseService(data_root)
    router = APIRouter()

    @router.post("/api/generate-text", response_model=ExerciseGenerationResponse)
    def generate_text(
        payload: ExerciseGenerationRequest,
    ) -> ExerciseGenerationResponse:
        try:
            return service.generate_text(payload)
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
