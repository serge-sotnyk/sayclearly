"""CLI entry point for the local SayClearly web app."""

import logging
import webbrowser

import uvicorn

from sayclearly.app import create_app

HOST = "127.0.0.1"
PORT = 8008


def main() -> None:
    url = f"http://{HOST}:{PORT}/"

    try:
        webbrowser.open(url)
    except Exception:
        logging.getLogger(__name__).warning(
            "Could not open browser automatically.",
            exc_info=True,
        )

    uvicorn.run(create_app(), host=HOST, port=PORT)
