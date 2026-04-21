from pathlib import Path

import pytest

from sayclearly.recording.service import (
    TEMP_RECORDINGS_DIR_NAME,
    EmptyRecordingError,
    RecordingService,
)
from sayclearly.storage.files import CACHE_DIR_NAME


def test_analyze_recording_saves_one_temp_file_and_returns_stub_review(tmp_path: Path) -> None:
    service = RecordingService(tmp_path)

    response = service.analyze_recording(
        audio_bytes=b"fake webm bytes",
        filename="sample.webm",
        content_type="audio/webm",
    )

    temp_dir = tmp_path / CACHE_DIR_NAME / TEMP_RECORDINGS_DIR_NAME
    saved_files = list(temp_dir.iterdir())

    assert len(saved_files) == 1
    assert saved_files[0].suffix == ".webm"
    assert response.summary
    assert response.clarity
    assert response.pace
    assert response.hesitations
    assert response.recommendations


def test_analyze_recording_keeps_only_newest_temp_file(tmp_path: Path) -> None:
    service = RecordingService(tmp_path)

    service.analyze_recording(
        audio_bytes=b"first file",
        filename="first.wav",
        content_type="audio/wav",
    )
    service.analyze_recording(
        audio_bytes=b"second file",
        filename="second.wav",
        content_type="audio/wav",
    )

    temp_dir = tmp_path / CACHE_DIR_NAME / TEMP_RECORDINGS_DIR_NAME
    saved_files = list(temp_dir.iterdir())

    assert len(saved_files) == 1
    assert saved_files[0].read_bytes() == b"second file"


def test_analyze_recording_rejects_empty_upload(tmp_path: Path) -> None:
    service = RecordingService(tmp_path)

    with pytest.raises(EmptyRecordingError, match="empty"):
        service.analyze_recording(
            audio_bytes=b"",
            filename="empty.webm",
            content_type="audio/webm",
        )
