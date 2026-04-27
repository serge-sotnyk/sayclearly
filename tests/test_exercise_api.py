from pathlib import Path

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from sayclearly.app import create_app
from sayclearly.exercise.api import ExerciseRoute, build_exercise_router
from sayclearly.exercise.service import (
    ExerciseGenerationInvalidCredentialsError,
    ExerciseGenerationProviderError,
    ExerciseServiceConfigurationError,
)
from sayclearly.gemini.client import GeneratedExercise
from sayclearly.storage.files import load_config, save_config


def make_payload() -> dict[str, object]:
    return {
        "language": "en",
        "analysis_language": "uk",
        "topic_prompt": "clear speech warmup",
    }


def test_post_generate_text_returns_generated_exercise(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "sayclearly.exercise.service.GeminiClient.generate_exercise",
        lambda self, *, prompt, model, thinking_level: GeneratedExercise(
            text="Take a steady breath and let each sentence settle before the next one."
        ),
    )
    client = TestClient(create_app(tmp_path))
    config = load_config(tmp_path)
    save_config(
        tmp_path,
        config.model_copy(
            update={"gemini": config.gemini.model_copy(update={"text_thinking_level": "low"})}
        ),
    )
    response = client.post(
        "/api/config",
        json={
            "text_language": "en",
            "analysis_language": "uk",
            "same_language_for_analysis": False,
            "ui_language": "en",
            "session_limit": 300,
            "keep_last_audio": False,
            "gemini": {
                "text_model": config.gemini.text_model,
                "analysis_model": config.gemini.analysis_model,
                "same_model_for_analysis": config.gemini.same_model_for_analysis,
                "text_thinking_level": "low",
                "api_key": "stored-key",
            },
            "langfuse": {
                "host": None,
                "public_key": None,
                "secret_key": None,
            },
        },
    )

    assert response.status_code == 200

    response = client.post("/api/generate-text", json=make_payload())

    assert response.status_code == 200
    assert response.json()["language"] == "en"
    assert response.json()["analysis_language"] == "uk"
    assert response.json()["topic_prompt"] == "clear speech warmup"
    assert "placeholder" not in response.json()["text"].lower()


def test_post_generate_text_returns_400_when_gemini_api_key_is_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "sayclearly.exercise.service.ExerciseService.generate_text",
        lambda self, payload: (_ for _ in ()).throw(
            ExerciseServiceConfigurationError("Gemini API key is required.")
        ),
    )
    client = TestClient(create_app(tmp_path))

    response = client.post("/api/generate-text", json=make_payload())

    assert response.status_code == 400
    assert "Gemini API key" in response.json()["detail"]


def test_post_generate_text_returns_provider_message_in_detail(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "sayclearly.exercise.service.ExerciseService.generate_text",
        lambda self, payload: (_ for _ in ()).throw(
            ExerciseGenerationProviderError(
                "Gemini: This model is currently experiencing high demand."
            )
        ),
    )
    client = TestClient(create_app(tmp_path))

    response = client.post("/api/generate-text", json=make_payload())

    assert response.status_code == 502
    assert response.json()["detail"] == "Gemini: This model is currently experiencing high demand."


def test_post_generate_text_returns_clear_invalid_credentials_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "sayclearly.exercise.service.ExerciseService.generate_text",
        lambda self, payload: (_ for _ in ()).throw(
            ExerciseGenerationInvalidCredentialsError(
                "Gemini API key was rejected. Update it and try again."
            )
        ),
    )
    client = TestClient(create_app(tmp_path))

    response = client.post("/api/generate-text", json=make_payload())

    assert response.status_code == 400
    assert "rejected" in response.json()["detail"].lower()
    assert "unavailable" not in response.json()["detail"].lower()


def test_post_generate_text_returns_400_for_invalid_payload_shape(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/generate-text",
        json={"language": "en", "unexpected": "field"},
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
        json={"language": "en", "unexpected": "field"},
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
        content='{"language": "en",',
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 400
    assert isinstance(response.json()["detail"], list)
    assert response.json()["detail"][0]["type"] == "json_invalid"
    assert response.json()["detail"][0]["loc"][0] == "body"


def test_exercise_route_keeps_non_body_validation_errors_as_422() -> None:
    router = APIRouter(route_class=ExerciseRoute)

    @router.get("/query-check")
    def query_check(limit: int) -> dict[str, int]:
        return {"limit": limit}

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    response = client.get("/query-check")

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][0] == "query"
