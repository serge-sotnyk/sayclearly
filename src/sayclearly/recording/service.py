from pathlib import Path
from uuid import uuid4

from sayclearly.recording.models import RecordingAnalysisResponse
from sayclearly.storage.files import CACHE_DIR_NAME, StorageError, ensure_storage_root

TEMP_RECORDINGS_DIR_NAME = "temporary-recordings"


class EmptyRecordingError(ValueError):
    """Raised when an uploaded recording has no content."""


class RecordingService:
    def __init__(self, data_root: Path | None = None) -> None:
        self.data_root = data_root

    def analyze_recording(
        self,
        audio_bytes: bytes,
        filename: str | None,
        content_type: str | None,
    ) -> RecordingAnalysisResponse:
        del content_type

        if not audio_bytes:
            raise EmptyRecordingError("Uploaded recording is empty.")

        storage_root = ensure_storage_root(self.data_root)
        temp_dir = storage_root / CACHE_DIR_NAME / TEMP_RECORDINGS_DIR_NAME
        suffix = Path(filename).suffix if filename and Path(filename).suffix else ".webm"
        path = temp_dir / f"{uuid4()}{suffix}"

        try:
            temp_dir.mkdir(parents=True, exist_ok=True)
            path.write_bytes(audio_bytes)
        except OSError as exc:
            raise StorageError(f"Could not write {path}") from exc

        self._remove_older_files(temp_dir, keep_path=path)

        return RecordingAnalysisResponse(
            summary=(
                "This placeholder review notes a steady attempt with room to sound more precise."
            ),
            clarity="Most words are understandable, but several consonants need firmer shaping.",
            pace="The pace is mostly even, though a few phrases rush at the end.",
            hesitations=["A short pause appears before one of the longer phrases."],
            recommendations=[
                "Repeat the passage once more with slightly slower sentence endings.",
            ],
        )

    def _remove_older_files(self, temp_dir: Path, keep_path: Path) -> None:
        for candidate in temp_dir.iterdir():
            if candidate == keep_path:
                continue
            try:
                candidate.unlink()
            except OSError:
                continue
