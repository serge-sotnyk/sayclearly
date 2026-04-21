from fastapi.testclient import TestClient

from sayclearly.app import create_app


def test_home_page_renders_stage_3_shell() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "data-app-root" in response.text
    assert 'data-screen="setup"' in response.text
    assert 'data-screen="exercise"' in response.text
    assert "data-settings-panel" in response.text
    assert "data-status-message" in response.text
    assert "data-open-settings-button" in response.text
    assert "data-api-key-input" in response.text
    assert "data-topic-input" in response.text
    assert "data-generate-button" in response.text
    assert "data-step-label" in response.text
    assert "data-step-title" in response.text
    assert "data-step-instruction" in response.text
    assert "data-exercise-text" in response.text
    assert "data-next-step-button" in response.text
    assert "data-settings-status" in response.text
    assert "data-clear-api-key-button" in response.text
    assert "data-close-settings-button" in response.text
    assert "/static/dist/app.js" in response.text


def test_home_page_uses_root_path_for_stage_3_bundle() -> None:
    client = TestClient(create_app(), root_path="/sayclearly")

    response = client.get("/")

    assert response.status_code == 200
    assert "/sayclearly/static/dist/app.js" in response.text


def test_frontend_bundle_is_served_with_generate_endpoint_reference() -> None:
    client = TestClient(create_app())

    response = client.get("/static/dist/app.js")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "/api/generate-text" in response.text
