from pathlib import Path
from unittest.mock import MagicMock

import pytest

from sayclearly.recording.models import AudioAnalysisMetadata, RecordingAnalysisResult
from sayclearly.recording.service import (
    TEMP_RECORDINGS_DIR_NAME,
    EmptyRecordingError,
    RecordingAnalysisProviderError,
    RecordingService,
)
from sayclearly.storage.files import CACHE_DIR_NAME


def test_analyze_recording_saves_temp_file_and_returns_review_and_analysis(tmp_path: Path) -> None:
    service = RecordingService(tmp_path)

    fake_analysis = MagicMock()
    fake_analysis.clarity_score = 72
    fake_analysis.pace_score = 65
    fake_analysis.hesitations = [{"start": 1.0, "end": 2.0, "note": "pause"}]
    fake_analysis.summary = ["Tempo increased near the end."]
    fake_analysis.recommendations = ["Slow down a little."]

    fake_client = MagicMock()
    fake_client.analyze_audio.return_value = fake_analysis
    service._gemini_client = fake_client

    metadata = AudioAnalysisMetadata(
        language="uk",
        analysis_language="uk",
        exercise_text="The quick brown fox.",
    )

    response = service.analyze_recording(
        audio_bytes=b"fake webm bytes",
        filename="sample.webm",
        content_type="audio/webm",
        metadata=metadata,
    )

    temp_dir = tmp_path / CACHE_DIR_NAME / TEMP_RECORDINGS_DIR_NAME

    assert list(temp_dir.iterdir()) == []
    assert isinstance(response, RecordingAnalysisResult)
    assert response.review.summary
    assert response.review.clarity
    assert response.review.pace
    assert response.review.hesitations == ["pause (at 1.0s-2.0s)"]
    assert response.review.recommendations == ["Slow down a little."]
    assert response.analysis.clarity_score == 72
    assert response.analysis.pace_score == 65
    assert response.analysis.summary == ["Tempo increased near the end."]
    assert response.analysis.hesitations[0].note == "pause"
    fake_client.analyze_audio.assert_called_once()


def test_analyze_recording_deletes_temp_file_after_success(tmp_path: Path) -> None:
    service = RecordingService(tmp_path)
    fake_client = MagicMock()
    fake_client.analyze_audio.return_value = MagicMock(
        clarity_score=70,
        pace_score=70,
        hesitations=[],
        summary=["Good."],
        recommendations=["Keep practicing."],
    )
    service._gemini_client = fake_client
    metadata = AudioAnalysisMetadata(language="uk", analysis_language="uk", exercise_text="Text.")

    service.analyze_recording(
        audio_bytes=b"temp bytes",
        filename="sample.webm",
        content_type="audio/webm",
        metadata=metadata,
    )

    temp_dir = tmp_path / CACHE_DIR_NAME / TEMP_RECORDINGS_DIR_NAME
    assert list(temp_dir.iterdir()) == []


def test_analyze_recording_deletes_temp_file_after_provider_failure(tmp_path: Path) -> None:
    service = RecordingService(tmp_path)
    fake_client = MagicMock()
    fake_client.analyze_audio.side_effect = RuntimeError("provider down")
    service._gemini_client = fake_client
    metadata = AudioAnalysisMetadata(language="uk", analysis_language="uk", exercise_text="Text.")

    with pytest.raises(RecordingAnalysisProviderError, match="unavailable"):
        service.analyze_recording(
            audio_bytes=b"temp bytes",
            filename="sample.webm",
            content_type="audio/webm",
            metadata=metadata,
        )

    temp_dir = tmp_path / CACHE_DIR_NAME / TEMP_RECORDINGS_DIR_NAME
    assert list(temp_dir.iterdir()) == []


def test_analyze_recording_rejects_empty_upload(tmp_path: Path) -> None:
    service = RecordingService(tmp_path)
    metadata = AudioAnalysisMetadata(language="uk", analysis_language="uk", exercise_text="Text.")

    with pytest.raises(EmptyRecordingError, match="empty"):
        service.analyze_recording(
            audio_bytes=b"",
            filename="empty.webm",
            content_type="audio/webm",
            metadata=metadata,
        )
