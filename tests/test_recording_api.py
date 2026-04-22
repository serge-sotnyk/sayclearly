from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from sayclearly.app import create_app
from sayclearly.storage.files import StorageError


def test_post_analyze_recording_returns_review_with_metadata(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    with patch(
        "sayclearly.recording.api.RecordingService.analyze_recording",
        return_value={
            "summary": "Good effort.",
            "clarity": "Clear.",
            "pace": "Steady.",
            "hesitations": [],
            "recommendations": ["Keep practicing."],
        },
    ):
        response = client.post(
            "/api/analyze-recording",
            data={"metadata": '{"language":"uk","analysis_language":"uk","exercise_text":"Fox"}'},
            files={"audio": ("sample.webm", b"fake webm bytes", "audio/webm")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]
    assert payload["clarity"]
    assert payload["pace"]


def test_post_analyze_recording_returns_400_when_metadata_is_missing(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/analyze-recording",
        files={"audio": ("sample.webm", b"fake webm bytes", "audio/webm")},
    )

    assert response.status_code == 400


def test_post_analyze_recording_returns_400_when_metadata_is_invalid_json(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/analyze-recording",
        data={"metadata": "not-json"},
        files={"audio": ("sample.webm", b"fake webm bytes", "audio/webm")},
    )

    assert response.status_code == 400


def test_post_analyze_recording_returns_400_for_empty_uploaded_file(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/analyze-recording",
        data={"metadata": '{"language":"uk","analysis_language":"uk","exercise_text":"Fox"}'},
        files={"audio": ("empty.webm", b"", "audio/webm")},
    )

    assert response.status_code == 400


def test_post_analyze_recording_returns_500_for_storage_error(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    with patch(
        "sayclearly.recording.api.RecordingService.analyze_recording",
        side_effect=StorageError("disk full"),
    ):
        response = client.post(
            "/api/analyze-recording",
            data={"metadata": '{"language":"uk","analysis_language":"uk","exercise_text":"Fox"}'},
            files={"audio": ("sample.webm", b"fake webm bytes", "audio/webm")},
        )

    assert response.status_code == 500
    assert response.json()["detail"] == "disk full"
