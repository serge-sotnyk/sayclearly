from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from sayclearly.exercise.models import (
    ExerciseGenerationRequest,
    ExerciseGenerationResponse,
)
from sayclearly.exercise.service import (
    ExerciseGenerationProviderError,
    ExerciseService,
    ExerciseServiceConfigurationError,
)
from sayclearly.storage.files import StorageError

BAD_REQUEST_VALIDATION_TYPES = {
    "extra_forbidden",
    "json_invalid",
    "missing",
    "model_attributes_type",
}


def _is_bad_request_validation_error(error: dict[str, Any]) -> bool:
    location = error.get("loc")
    return (
        isinstance(location, tuple)
        and bool(location)
        and location[0] == "body"
        and error.get("type") in BAD_REQUEST_VALIDATION_TYPES
    )


class ExerciseRoute(APIRoute):
    def get_route_handler(self):
        original_route_handler = super().get_route_handler()

        async def custom_route_handler(request: Request):
            try:
                return await original_route_handler(request)
            except RequestValidationError as exc:
                errors = exc.errors()
                status_code = (
                    400 if all(_is_bad_request_validation_error(error) for error in errors) else 422
                )
                return JSONResponse(
                    status_code=status_code,
                    content={"detail": jsonable_encoder(errors)},
                )

        return custom_route_handler


def build_exercise_router(data_root: Path | None = None) -> APIRouter:
    service = ExerciseService(data_root)
    router = APIRouter(route_class=ExerciseRoute)

    @router.post("/api/generate-text", response_model=ExerciseGenerationResponse)
    def generate_text(payload: ExerciseGenerationRequest) -> ExerciseGenerationResponse:
        try:
            return service.generate_text(payload)
        except ExerciseServiceConfigurationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except ExerciseGenerationProviderError as exc:
            raise HTTPException(
                status_code=502,
                detail="Text generation is unavailable right now. Please try again.",
            ) from exc
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
