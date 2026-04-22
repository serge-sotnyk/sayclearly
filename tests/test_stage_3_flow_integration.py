from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sayclearly.app import create_app
from sayclearly.gemini.client import GeneratedExercise


def test_stage_3_happy_path_loads_config_saves_and_generates_text(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "sayclearly.exercise.service.GeminiClient.generate_exercise",
        lambda self, *, prompt, model, thinking_level: GeneratedExercise(
            text="Order your coffee slowly, then thank the barista with a calm, clear voice."
        ),
    )
    client = TestClient(create_app(tmp_path))

    config_response = client.get("/api/config")

    assert config_response.status_code == 200
    config = config_response.json()

    save_response = client.post(
        "/api/config",
        json={
            "text_language": "en",
            "analysis_language": "uk",
            "same_language_for_analysis": False,
            "ui_language": config["ui_language"],
            "last_topic_prompt": "Order coffee before work",
            "session_limit": config["session_limit"],
            "keep_last_audio": config["keep_last_audio"],
            "gemini": {
                "text_model": config["gemini"]["text_model"],
                "analysis_model": config["gemini"]["analysis_model"],
                "same_model_for_analysis": config["gemini"]["same_model_for_analysis"],
                "text_thinking_level": config["gemini"]["text_thinking_level"],
                "api_key": "stored-key",
            },
            "langfuse": {
                "host": config["langfuse"]["host"],
                "public_key": None,
                "secret_key": None,
            },
        },
    )

    assert save_response.status_code == 200
    assert save_response.json()["text_language"] == "en"
    assert save_response.json()["last_topic_prompt"] == "Order coffee before work"

    generate_response = client.post(
        "/api/generate-text",
        json={
            "language": "en",
            "analysis_language": "uk",
            "topic_prompt": "",
            "reuse_last_topic": True,
        },
    )

    assert generate_response.status_code == 200
    assert generate_response.json() == {
        "language": "en",
        "analysis_language": "uk",
        "topic_prompt": "Order coffee before work",
        "text": generate_response.json()["text"],
    }
    assert "placeholder" not in generate_response.json()["text"].lower()
    assert "coffee" in generate_response.json()["text"].lower()
