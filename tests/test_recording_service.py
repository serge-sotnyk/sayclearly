from pathlib import Path
from unittest.mock import MagicMock

import pytest

from sayclearly.gemini.client import GeminiProviderError
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
    fake_analysis.clarity_comment = "Чітко вимовлені приголосні, окрім слова «термоядерні»."
    fake_analysis.pace_score = 65
    fake_analysis.pace_comment = "Темп прискорюється у другому реченні."
    fake_analysis.hesitations = [{"start": 1.0, "end": 2.0, "note": "пауза перед «бази»"}]
    fake_analysis.summary = ["Передано основну ідею про надійність баз даних."]
    fake_analysis.recommendations = ["Сповільнити темп після першого речення."]

    fake_client = MagicMock()
    fake_client.analyze_audio.return_value = fake_analysis
    service._gemini_client = fake_client

    metadata = AudioAnalysisMetadata(
        language="Ukrainian",
        analysis_language="Ukrainian",
        exercise_text="Сучасний світ тримається на базах даних.",
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
    assert response.review.summary == "Передано основну ідею про надійність баз даних."
    assert response.review.clarity == "Чітко вимовлені приголосні, окрім слова «термоядерні»."
    assert response.review.pace == "Темп прискорюється у другому реченні."
    assert len(response.review.hesitations) == 1
    assert response.review.hesitations[0].note == "пауза перед «бази»"
    assert response.review.hesitations[0].start == 1.0
    assert response.review.hesitations[0].end == 2.0
    assert response.review.recommendations == ["Сповільнити темп після першого речення."]
    assert response.analysis.clarity_score == 72
    assert response.analysis.pace_score == 65
    assert response.analysis.summary == ["Передано основну ідею про надійність баз даних."]
    assert response.analysis.hesitations[0].note == "пауза перед «бази»"
    fake_client.analyze_audio.assert_called_once()
    call_kwargs = fake_client.analyze_audio.call_args.kwargs
    assert call_kwargs["system_instruction"] is not None
    assert "Ukrainian" in call_kwargs["system_instruction"]
    assert "Ukrainian" in call_kwargs["prompt"]


def test_analyze_recording_deletes_temp_file_after_success(tmp_path: Path) -> None:
    service = RecordingService(tmp_path)
    fake_client = MagicMock()
    fake_client.analyze_audio.return_value = MagicMock(
        clarity_score=70,
        clarity_comment="Clear.",
        pace_score=70,
        pace_comment="Steady.",
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

    with pytest.raises(RecordingAnalysisProviderError, match="provider down"):
        service.analyze_recording(
            audio_bytes=b"temp bytes",
            filename="sample.webm",
            content_type="audio/webm",
            metadata=metadata,
        )

    temp_dir = tmp_path / CACHE_DIR_NAME / TEMP_RECORDINGS_DIR_NAME
    assert list(temp_dir.iterdir()) == []


def test_analyze_recording_propagates_provider_message_with_gemini_prefix(
    tmp_path: Path,
) -> None:
    fake_client = MagicMock()
    fake_client.analyze_audio.side_effect = GeminiProviderError("Service is currently overloaded. Try again later.")
    service = RecordingService(tmp_path, gemini_client=fake_client)
    metadata = AudioAnalysisMetadata(language="uk", analysis_language="uk", exercise_text="Text.")

    with pytest.raises(
        RecordingAnalysisProviderError,
        match=r"^Gemini: Service is currently overloaded\. Try again later\.$",
    ):
        service.analyze_recording(
            audio_bytes=b"temp bytes",
            filename="sample.webm",
            content_type="audio/webm",
            metadata=metadata,
        )


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
