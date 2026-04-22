import os
from pathlib import Path
from uuid import uuid4

from sayclearly.gemini.catalog import sanitize_analysis_model
from sayclearly.gemini.client import (
    GeminiClient,
    GeminiInvalidCredentialsError,
    GeminiMalformedResponseError,
    MissingGeminiApiKeyError,
)
from sayclearly.gemini.telemetry import GeminiTelemetry
from sayclearly.recording.models import (
    AudioAnalysisMetadata,
    RecordingAnalysisResponse,
    StructuredAudioAnalysis,
)
from sayclearly.recording.prompts import (
    build_audio_analysis_prompt,
    build_audio_analysis_system_instruction,
)
from sayclearly.storage.files import (
    CACHE_DIR_NAME,
    StorageError,
    ensure_storage_root,
    load_config,
    load_secrets,
)

TEMP_RECORDINGS_DIR_NAME = "temporary-recordings"


class EmptyRecordingError(ValueError):
    """Raised when an uploaded recording has no content."""


class RecordingServiceError(RuntimeError):
    """Raised when recording analysis fails."""


class RecordingServiceConfigurationError(RecordingServiceError):
    """Raised when local configuration is missing required analysis settings."""


class RecordingAnalysisProviderError(RecordingServiceError):
    """Raised when audio analysis is unavailable from the provider."""


class RecordingAnalysisInvalidCredentialsError(RecordingServiceError):
    """Raised when the configured Gemini credentials are rejected."""


class RecordingService:
    def __init__(
        self,
        data_root: Path | None = None,
        *,
        gemini_client: GeminiClient | object | None = None,
        telemetry: GeminiTelemetry | None = None,
    ) -> None:
        self.data_root = data_root
        self._gemini_client = gemini_client
        self._telemetry = telemetry or GeminiTelemetry()

    def analyze_recording(
        self,
        audio_bytes: bytes,
        filename: str | None,
        content_type: str | None,
        metadata: AudioAnalysisMetadata,
    ) -> RecordingAnalysisResponse:
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

        config = load_config(self.data_root)
        client = self._gemini_client or self._build_gemini_client()

        try:
            structured = client.analyze_audio(
                audio_bytes=audio_bytes,
                content_type=content_type or "audio/webm",
                prompt=build_audio_analysis_prompt(
                    language=metadata.language,
                    analysis_language=metadata.analysis_language,
                    exercise_text=metadata.exercise_text,
                ),
                model=sanitize_analysis_model(config.gemini.analysis_model),
                thinking_level=config.gemini.text_thinking_level,
                system_instruction=build_audio_analysis_system_instruction(),
            )
        except MissingGeminiApiKeyError as exc:
            raise RecordingServiceConfigurationError(
                "Gemini API key is required before analyzing recordings."
            ) from exc
        except GeminiInvalidCredentialsError as exc:
            raise RecordingAnalysisInvalidCredentialsError(
                "Gemini API key was rejected. Update it and try again."
            ) from exc
        except GeminiMalformedResponseError as exc:
            raise RecordingAnalysisProviderError(
                "Analysis did not complete. Try again."
            ) from exc
        except Exception as exc:
            raise RecordingAnalysisProviderError(
                "Analysis is unavailable right now. Please try again."
            ) from exc

        return self._normalize_analysis(structured)

    def _build_gemini_client(self) -> GeminiClient:
        api_key = self._resolve_gemini_api_key()
        if api_key is None:
            raise RecordingServiceConfigurationError(
                "Gemini API key is required before analyzing recordings."
            )
        return GeminiClient(api_key=api_key, telemetry=self._telemetry)

    def _resolve_gemini_api_key(self) -> str | None:
        env_api_key = os.getenv("GEMINI_API_KEY")
        if env_api_key and env_api_key.strip():
            return env_api_key.strip()
        stored_api_key = load_secrets(self.data_root).gemini.api_key
        if stored_api_key and stored_api_key.strip():
            return stored_api_key.strip()
        return None

    def _normalize_analysis(self, structured: StructuredAudioAnalysis) -> RecordingAnalysisResponse:
        clarity_text = self._score_to_text(structured.clarity_score, "clarity")
        pace_text = self._score_to_text(structured.pace_score, "pace")
        hesitations = [
            (
                f"{h['note']} (at {h['start']:.1f}s-{h['end']:.1f}s)"
                if 'start' in h and 'end' in h
                else h.get('note', '')
            )
            for h in structured.hesitations
        ]
        summary = " ".join(structured.summary) if structured.summary else "Analysis complete."

        return RecordingAnalysisResponse(
            summary=summary,
            clarity=clarity_text,
            pace=pace_text,
            hesitations=hesitations,
            recommendations=structured.recommendations,
        )

    def _score_to_text(self, score: int, dimension: str) -> str:
        if score >= 80:
            return f"The {dimension} is very good."
        if score >= 60:
            return f"The {dimension} is decent, with room for improvement."
        if score >= 40:
            return f"The {dimension} needs some attention."
        return f"The {dimension} needs significant work."

    def _remove_older_files(self, temp_dir: Path, keep_path: Path) -> None:
        for candidate in temp_dir.iterdir():
            if candidate == keep_path:
                continue
            try:
                candidate.unlink()
            except OSError:
                continue
