from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from sayclearly.exercise.models import (
    ExerciseGenerationRequest,
    ExerciseGenerationResponse,
)
from sayclearly.exercise.service import ExerciseService
from sayclearly.storage.files import StorageError

BAD_REQUEST_VALIDATION_TYPES = {
    "extra_forbidden",
    "json_invalid",
    "missing",
    "model_attributes_type",
}


def _is_bad_request_validation_error(error: dict[str, Any]) -> bool:
    return error.get("type") in BAD_REQUEST_VALIDATION_TYPES


def build_exercise_router(data_root: Path | None = None) -> APIRouter:
    service = ExerciseService(data_root)
    router = APIRouter()

    @router.post("/api/generate-text", response_model=ExerciseGenerationResponse)
    async def generate_text(request: Request) -> ExerciseGenerationResponse:
        try:
            try:
                raw_payload = await request.json()
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

            try:
                payload = ExerciseGenerationRequest.model_validate(raw_payload)
            except ValidationError as exc:
                errors = exc.errors()
                status_code = 400 if all(
                    _is_bad_request_validation_error(error) for error in errors
                ) else 422
                raise HTTPException(status_code=status_code, detail=errors) from exc

            return service.generate_text(payload)
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
