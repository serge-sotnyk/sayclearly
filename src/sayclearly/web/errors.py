from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

BAD_REQUEST_VALIDATION_ROUTES = {
    ("POST", "/api/config"),
    ("POST", "/api/history"),
    ("POST", "/api/analyze-recording"),
}
BAD_REQUEST_VALIDATION_TYPES = {
    "extra_forbidden",
    "json_invalid",
    "missing",
    "model_attributes_type",
}


def is_bad_request_validation_error(error: dict[str, Any]) -> bool:
    location = error.get("loc")
    return (
        isinstance(location, tuple)
        and bool(location)
        and location[0] == "body"
        and error.get("type") in BAD_REQUEST_VALIDATION_TYPES
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        route_key = (request.method, request.url.path)
        errors = exc.errors()
        status_code = 422
        if route_key in BAD_REQUEST_VALIDATION_ROUTES and all(
            is_bad_request_validation_error(error) for error in errors
        ):
            status_code = 400
        return JSONResponse(
            status_code=status_code,
            content={"detail": jsonable_encoder(errors)},
        )
