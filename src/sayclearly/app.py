import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from sayclearly.config.api import build_config_router
from sayclearly.exercise.api import build_exercise_router
from sayclearly.history.api import build_history_router
from sayclearly.history.service import HistoryService
from sayclearly.recording.api import build_recording_router
from sayclearly.storage.files import StorageError
from sayclearly.web.errors import install_error_handlers

PACKAGE_ROOT = Path(__file__).resolve().parent
TEMPLATES_DIR = PACKAGE_ROOT / "templates"
STATIC_DIR = PACKAGE_ROOT / "static"

logger = logging.getLogger(__name__)


def create_app(data_root: Path | None = None) -> FastAPI:
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    app = FastAPI(
        title="SayClearly",
    )

    history_service = HistoryService(data_root)

    install_error_handlers(app)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.include_router(build_config_router(data_root))
    app.include_router(build_exercise_router(data_root))
    app.include_router(build_history_router(data_root))
    app.include_router(build_recording_router(data_root))

    @app.get("/")
    def home(request: Request):
        try:
            recent_entries = history_service.recent_topic_entries()
        except StorageError:
            logger.exception("Could not load recent topics for home page")
            recent_entries = []

        recent_topics = [entry.model_dump() for entry in recent_entries]
        initial_topic = recent_entries[0].topic if recent_entries else None

        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={
                "page_title": "SayClearly",
                "recent_topics": recent_topics,
                "initial_topic": initial_topic,
            },
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
