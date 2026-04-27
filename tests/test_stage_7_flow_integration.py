from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sayclearly.app import create_app
from sayclearly.gemini.client import GeneratedExercise
from sayclearly.recording.models import StructuredAudioAnalysis
from sayclearly.recording.service import TEMP_RECORDINGS_DIR_NAME
from sayclearly.storage.files import CACHE_DIR_NAME


def test_stage_7_happy_path_saves_history_and_reuses_topic(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    exercise_text = "Speak clearly about ordering coffee before work."
    monkeypatch.setattr(
        "sayclearly.exercise.service.GeminiClient.generate_exercise",
        lambda self, *, prompt, model, thinking_level: GeneratedExercise(text=exercise_text),
    )

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

    client = TestClient(create_app(tmp_path))
    temp_dir = tmp_path / CACHE_DIR_NAME / TEMP_RECORDINGS_DIR_NAME
    config = client.get("/api/config").json()
    client.post(
        "/api/config",
        json={
            "text_language": "en",
            "analysis_language": "uk",
            "same_language_for_analysis": False,
            "ui_language": config["ui_language"],
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

    exercise = client.post(
        "/api/generate-text",
        json={
            "language": "en",
            "analysis_language": "uk",
            "topic_prompt": "Order coffee before work",
        },
    ).json()

    analysis = client.post(
        "/api/analyze-recording",
        data={
            "metadata": (
                f'{{"language":"en","analysis_language":"uk","exercise_text":"{exercise_text}"}}'
            )
        },
        files={"audio": ("sample.webm", b"fake webm bytes", "audio/webm")},
    ).json()

    assert analysis["review"]["summary"]
    assert not temp_dir.exists() or list(temp_dir.iterdir()) == []

    session_payload = {
        "id": "session-1",
        "created_at": "2026-04-23T10:12:33Z",
        "language": exercise["language"],
        "topic_prompt": exercise["topic_prompt"],
        "text": exercise["text"],
        "analysis": analysis["analysis"],
    }
    saved = client.post("/api/history", json=session_payload)
    listed = client.get("/api/history")
    detail = client.get("/api/history/session-1")
    reused = client.post(
        "/api/generate-text",
        json={
            "language": "en",
            "analysis_language": "uk",
            "topic_prompt": detail.json()["topic_prompt"],
        },
    )

    assert saved.status_code == 200
    assert listed.status_code == 200
    assert listed.json()["sessions"][0]["id"] == "session-1"
    assert detail.status_code == 200
    assert detail.json()["analysis"]["summary"] == ["Good effort."]
    assert reused.status_code == 200
    assert reused.json()["topic_prompt"] == "Order coffee before work"
