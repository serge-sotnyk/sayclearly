from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sayclearly.app import create_app
from sayclearly.gemini.client import GeneratedExercise
from sayclearly.recording.models import StructuredAudioAnalysis


def test_stage_4_happy_path_runs_config_generation_and_recording_analysis(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    exercise_text = (
        "Order your coffee clearly, then thank the barista with a calm and steady voice."
    )
    monkeypatch.setattr(
        "sayclearly.exercise.service.GeminiClient.generate_exercise",
        lambda self, *, prompt, model, thinking_level: GeneratedExercise(text=exercise_text),
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

    def fake_analyze_audio(
        self,
        *,
        audio_bytes,
        content_type,
        prompt,
        model,
        thinking_level,
        system_instruction=None,
    ):
        return StructuredAudioAnalysis(
            clarity_score=72,
            pace_score=65,
            hesitations=[{"start": 1.0, "end": 2.0, "note": "pause"}],
            summary=["Good effort."],
            recommendations=["Keep practicing."],
        )

    monkeypatch.setattr(
        "sayclearly.gemini.client.GeminiClient.analyze_audio",
        fake_analyze_audio,
    )

    analyze_response = client.post(
        "/api/analyze-recording",
        data={
            "metadata": (
                f'{{"language":"en","analysis_language":"uk","exercise_text":"{exercise_text}"}}'
            )
        },
        files={"audio": ("sample.webm", b"fake webm bytes", "audio/webm")},
    )

    assert analyze_response.status_code == 200
    payload = analyze_response.json()
    assert payload["summary"]
    assert payload["recommendations"]

    temp_dir = tmp_path / "cache" / "temporary-recordings"
    assert len(list(temp_dir.iterdir())) == 1
