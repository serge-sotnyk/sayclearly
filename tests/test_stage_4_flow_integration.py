from pathlib import Path

from fastapi.testclient import TestClient

from sayclearly.app import create_app


def test_stage_4_happy_path_runs_config_generation_and_recording_analysis(
    tmp_path: Path,
) -> None:
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
                "model": config["gemini"]["model"],
                "api_key": None,
            },
            "langfuse": {
                "host": config["langfuse"]["host"],
                "public_key": None,
                "secret_key": None,
            },
        },
    )

    assert save_response.status_code == 200

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

    analyze_response = client.post(
        "/api/analyze-recording",
        files={"audio": ("sample.webm", b"fake webm bytes", "audio/webm")},
    )

    assert analyze_response.status_code == 200
    payload = analyze_response.json()
    assert payload["summary"]
    assert payload["recommendations"]

    temp_dir = tmp_path / "cache" / "temporary-recordings"
    assert len(list(temp_dir.iterdir())) == 1
