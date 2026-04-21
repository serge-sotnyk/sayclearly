from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from sayclearly.config_api import build_config_router
from sayclearly.history_api import build_history_router

PACKAGE_ROOT = Path(__file__).resolve().parent
TEMPLATES_DIR = PACKAGE_ROOT / "templates"
STATIC_DIR = PACKAGE_ROOT / "static"
BAD_REQUEST_VALIDATION_ROUTES = {
    ("POST", "/api/config"),
    ("POST", "/api/history"),
}
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


def create_app(data_root: Path | None = None) -> FastAPI:
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    app = FastAPI(
        title="SayClearly",
    )

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        route_key = (request.method, request.url.path)
        errors = exc.errors()
        status_code = 422
        if route_key in BAD_REQUEST_VALIDATION_ROUTES and all(
            _is_bad_request_validation_error(error) for error in errors
        ):
            status_code = 400
        return JSONResponse(
            status_code=status_code,
            content={"detail": jsonable_encoder(errors)},
        )

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.include_router(build_config_router(data_root))
    app.include_router(build_history_router(data_root))

    @app.get("/")
    def home(request: Request):
        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={"page_title": "SayClearly"},
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
