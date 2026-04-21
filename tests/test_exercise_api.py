from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from sayclearly.app import create_app
from sayclearly.exercise.api import build_exercise_router
from sayclearly.storage.files import load_config, save_config


def make_payload() -> dict[str, object]:
    return {
        "text_language": "en",
        "analysis_language": "uk",
        "topic_prompt": "clear speech warmup",
        "reuse_last_topic": False,
    }


def test_post_generate_text_returns_placeholder_exercise(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post("/api/generate-text", json=make_payload())

    assert response.status_code == 200
    assert response.json()["text_language"] == "en"
    assert response.json()["analysis_language"] == "uk"
    assert response.json()["topic_prompt"] == "clear speech warmup"
    assert "placeholder" in response.json()["text"].lower()


def test_post_generate_text_can_reuse_last_topic_from_config(tmp_path: Path) -> None:
    config = load_config(tmp_path)
    save_config(
        tmp_path,
        config.model_copy(update={"last_topic_prompt": "slow breathing before speaking"}),
    )
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/generate-text",
        json={
            "text_language": "en",
            "analysis_language": "uk",
            "topic_prompt": " ",
            "reuse_last_topic": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["topic_prompt"] == "slow breathing before speaking"


def test_post_generate_text_returns_400_for_invalid_payload_shape(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/generate-text",
        json={"text_language": "en", "unexpected": "field"},
    )

    assert response.status_code == 400
    assert isinstance(response.json()["detail"], list)
    assert all(error["loc"][0] == "body" for error in response.json()["detail"])


def test_exercise_router_returns_400_for_invalid_payload_shape_without_global_handler(
    tmp_path: Path,
) -> None:
    app = FastAPI()
    app.include_router(build_exercise_router(tmp_path))
    client = TestClient(app)

    response = client.post(
        "/api/generate-text",
        json={"text_language": "en", "unexpected": "field"},
    )

    assert response.status_code == 400
    assert isinstance(response.json()["detail"], list)
    assert all(error["loc"][0] == "body" for error in response.json()["detail"])


def test_post_generate_text_returns_fastapi_style_error_for_malformed_json(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/generate-text",
        content='{"text_language": "en",',
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 400
    assert isinstance(response.json()["detail"], list)
    assert response.json()["detail"][0]["type"] == "json_invalid"
    assert response.json()["detail"][0]["loc"][0] == "body"
