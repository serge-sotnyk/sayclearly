from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

PACKAGE_ROOT = Path(__file__).resolve().parent
TEMPLATES_DIR = PACKAGE_ROOT / "templates"
STATIC_DIR = PACKAGE_ROOT / "static"


def create_app() -> FastAPI:
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    app = FastAPI(
        title="SayClearly",
    )

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

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
