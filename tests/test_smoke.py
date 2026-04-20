from fastapi import FastAPI
from fastapi.testclient import TestClient

from sayclearly.app import create_app


def test_create_app_returns_fastapi_instance() -> None:
    app = create_app()

    assert isinstance(app, FastAPI)


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_docs_endpoint_is_not_exposed() -> None:
    client = TestClient(create_app())

    response = client.get("/docs")

    assert response.status_code == 404
