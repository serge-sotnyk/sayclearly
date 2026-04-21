from fastapi.testclient import TestClient

from sayclearly.app import create_app


def test_home_page_renders_stage_3_shell() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert 'data-app-root' in response.text
    assert 'data-screen="setup"' in response.text
    assert 'data-screen="exercise"' in response.text
    assert 'data-settings-panel' in response.text
    assert '/static/dist/app.js' in response.text


def test_home_page_uses_root_path_for_stage_3_bundle() -> None:
    client = TestClient(create_app(), root_path="/sayclearly")

    response = client.get("/")

    assert response.status_code == 200
    assert '/sayclearly/static/dist/app.js' in response.text
