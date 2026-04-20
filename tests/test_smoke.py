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


def test_home_page_renders_local_shell() -> None:
    client = TestClient(create_app(), root_path="/sayclearly")

    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "SayClearly" in response.text
    assert "/sayclearly/static/styles.css" in response.text


def test_static_stylesheet_is_served() -> None:
    client = TestClient(create_app())

    response = client.get("/static/styles.css")

    assert response.status_code == 200
    assert "text/css" in response.headers["content-type"]
    assert ".page-shell" in response.text


def test_docs_endpoint_is_not_exposed() -> None:
    client = TestClient(create_app())

    response = client.get("/docs")

    assert response.status_code == 404


def test_redoc_endpoint_is_not_exposed() -> None:
    client = TestClient(create_app())

    response = client.get("/redoc")

    assert response.status_code == 404


def test_openapi_endpoint_is_not_exposed() -> None:
    client = TestClient(create_app())

    response = client.get("/openapi.json")

    assert response.status_code == 404
