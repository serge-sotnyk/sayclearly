"""CLI entry point for the local SayClearly web app."""

import logging
import webbrowser
from pathlib import Path

import uvicorn
from dotenv import find_dotenv, load_dotenv

from sayclearly.app import create_app

HOST = "127.0.0.1"
PORT = 8008


def main() -> None:
    dotenv_path = find_dotenv(filename=".env", usecwd=True)
    if dotenv_path:
        load_dotenv(dotenv_path=Path(dotenv_path), override=False)
    else:
        load_dotenv(override=False)
    app = create_app()
    url = f"http://{HOST}:{PORT}/"

    def open_browser() -> None:
        try:
            webbrowser.open(url)
        except Exception:
            logging.getLogger(__name__).info("Could not open browser automatically.")

    app.router.add_event_handler("startup", open_browser)

    uvicorn.run(app, host=HOST, port=PORT)
