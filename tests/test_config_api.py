from pathlib import Path

from fastapi.testclient import TestClient

from sayclearly.app import create_app


def make_payload() -> dict[str, object]:
    return {
        "text_language": "en",
        "analysis_language": "uk",
        "same_language_for_analysis": False,
        "ui_language": "en",
        "last_topic_prompt": "interesting facts about astronomy",
        "session_limit": 250,
        "keep_last_audio": False,
        "gemini": {
            "text_model": "gemini-3-flash",
            "analysis_model": "gemini-3.1-flash-lite-preview",
            "same_model_for_analysis": False,
            "text_thinking_level": "medium",
            "api_key": "stored-gemini",
        },
        "langfuse": {
            "host": "https://langfuse.example",
            "public_key": "stored-public",
            "secret_key": "stored-secret",
        },
    }


def test_get_config_returns_public_contract(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json()["gemini"] == {
        "model": "gemini-3-flash",
        "text_model": "gemini-3-flash",
        "analysis_model": "gemini-3-flash",
        "same_model_for_analysis": True,
        "text_thinking_level": "high",
        "has_api_key": False,
        "api_key_source": "none",
        "available_models": response.json()["gemini"]["available_models"],
    }


def test_post_config_persists_changes_across_app_recreation(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    post_response = client.post("/api/config", json=make_payload())
    second_client = TestClient(create_app(tmp_path))
    get_response = second_client.get("/api/config")

    assert post_response.status_code == 200
    assert get_response.status_code == 200
    assert get_response.json()["text_language"] == "en"
    assert get_response.json()["gemini"]["has_api_key"] is True
    assert get_response.json()["gemini"]["api_key_source"] == "stored"
    assert get_response.json()["gemini"]["text_model"] == "gemini-3-flash"
    assert get_response.json()["gemini"]["analysis_model"] == "gemini-3.1-flash-lite-preview"


def test_delete_api_key_clears_only_the_stored_value(tmp_path: Path, monkeypatch) -> None:
    client = TestClient(create_app(tmp_path))
    client.post("/api/config", json=make_payload())
    monkeypatch.setenv("GEMINI_API_KEY", "env-gemini")

    response = client.delete("/api/config/api-key")

    assert response.status_code == 200
    assert response.json()["gemini"]["has_api_key"] is True
    assert response.json()["gemini"]["api_key_source"] == "env"


def test_post_config_returns_400_for_invalid_payload_shape(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/config",
        json={"text_language": "en", "unexpected": "field"},
    )

    assert response.status_code == 400


def test_post_config_returns_422_for_semantically_invalid_payload(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    payload = make_payload()
    payload["session_limit"] = 0

    response = client.post("/api/config", json=payload)

    assert response.status_code == 422


def test_post_config_accepts_legacy_gemini_model_payload(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    payload = make_payload()
    payload["gemini"] = {
        "model": "gemini-3.1-flash-lite-preview",
        "api_key": None,
    }

    response = client.post("/api/config", json=payload)

    assert response.status_code == 200
    assert response.json()["gemini"]["model"] == "gemini-3.1-flash-lite-preview"
    assert response.json()["gemini"]["text_model"] == "gemini-3.1-flash-lite-preview"
    assert response.json()["gemini"]["analysis_model"] == "gemini-3.1-flash-lite-preview"
    assert response.json()["gemini"]["same_model_for_analysis"] is True
