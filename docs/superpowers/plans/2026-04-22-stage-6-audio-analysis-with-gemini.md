# Stage 6 Audio Analysis with Gemini Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder recording analysis stub with real Gemini-backed audio analysis, including multipart metadata upload, structured model output, normalization into the existing UI format, and Langfuse instrumentation.

**Architecture:** Expand the existing `recording/` domain with `prompts.py` and structured analysis models. Extend `gemini/client.py` with `analyze_audio()` using `types.Part.from_bytes()` for inline audio. Extend `gemini/telemetry.py` with `start_audio_analysis()`. The frontend sends `audio` + `metadata` as a multipart FormData payload. The backend validates metadata, saves audio temporarily, calls Gemini, and maps the structured response into the existing `RecordingAnalysisResponse`.

**Tech Stack:** Python 3.13+, FastAPI, Pydantic, google-genai, pytest, TypeScript

---

## File Structure

- **Create:** `src/sayclearly/recording/prompts.py` — system instruction and user prompt builders for audio analysis.
- **Modify:** `src/sayclearly/recording/models.py` — add `AudioAnalysisMetadata` and `StructuredAudioAnalysis`.
- **Modify:** `src/sayclearly/recording/service.py` — replace stub with real orchestration: config/secrets resolution, prompt building, Gemini call, response normalization.
- **Modify:** `src/sayclearly/recording/api.py` — accept multipart with `audio` + `metadata`, validate metadata, pass everything to service.
- **Modify:** `src/sayclearly/gemini/client.py` — add `analyze_audio()` method with inline audio bytes.
- **Modify:** `src/sayclearly/gemini/telemetry.py` — add `start_audio_analysis()` method.
- **Modify:** `src/sayclearly/static/app.ts` — append `metadata` JSON to the FormData before upload.
- **Modify:** `src/sayclearly/static/dist/app.js` — committed compiled output of `app.ts`.
- **Create:** `tests/test_recording_prompts.py` — prompt builder tests.
- **Modify:** `tests/test_recording_service.py` — real analysis orchestration and normalization tests.
- **Modify:** `tests/test_recording_api.py` — multipart metadata and error handling tests.
- **Modify:** `tests/test_gemini_client.py` — `analyze_audio` construction and parsing tests.
- **Modify:** `tests/test_gemini_telemetry.py` — `start_audio_analysis` coverage.
- **Modify:** `tests/test_stage_4_flow_integration.py` — replace stub assertions with real analysis expectations.

---

## Task 1: Expand Recording Models

**Files:**
- Modify: `src/sayclearly/recording/models.py`
- Test: `tests/test_recording_service.py` (will be updated in Task 3)

- [ ] **Step 1: Write the new models**

Add to `src/sayclearly/recording/models.py`:

```python
from pydantic import BaseModel, ConfigDict, Field


class AudioAnalysisMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str
    analysis_language: str
    exercise_text: str


class StructuredAudioAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clarity_score: int = Field(ge=0, le=100)
    pace_score: int = Field(ge=0, le=100)
    hesitations: list[dict[str, object]] = Field(default_factory=list)
    summary: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
```

Keep the existing `RecordingAnalysisResponse` unchanged.

- [ ] **Step 2: Run existing tests to confirm no breakage**

Run: `uv run pytest tests/test_recording_service.py tests/test_recording_api.py -q`
Expected: PASS (models are additive; no existing behavior is broken).

- [ ] **Step 3: Commit**

```bash
git add src/sayclearly/recording/models.py
git commit -m "feat: add AudioAnalysisMetadata and StructuredAudioAnalysis models"
```

---

## Task 2: Add Recording Prompts

**Files:**
- Create: `src/sayclearly/recording/prompts.py`
- Create: `tests/test_recording_prompts.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_recording_prompts.py`:

```python
from sayclearly.recording.prompts import (
    build_audio_analysis_prompt,
    build_audio_analysis_system_instruction,
)


def test_build_audio_analysis_prompt_includes_all_context() -> None:
    prompt = build_audio_analysis_prompt(
        language="uk",
        analysis_language="en",
        exercise_text="The quick brown fox.",
    )

    assert "uk" in prompt
    assert "en" in prompt
    assert "The quick brown fox." in prompt
    assert "clarity_score" in prompt
    assert "pace_score" in prompt


def test_build_audio_analysis_system_instruction_requires_json() -> None:
    instruction = build_audio_analysis_system_instruction()

    assert "JSON" in instruction
    assert "gentle" in instruction.lower() or "clarity" in instruction.lower()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_recording_prompts.py -q`
Expected: FAIL — modules do not exist yet.

- [ ] **Step 3: Implement the prompt builders**

Create `src/sayclearly/recording/prompts.py`:

```python
def build_audio_analysis_system_instruction() -> str:
    return (
        "You are a diction and speech clarity coach. "
        "Analyze the provided audio recording of a spoken retelling. "
        "Focus on: speech clarity and articulation, speaking pace and rhythm, "
        "hesitations, pauses, and restarts, blurred or swallowed word endings, "
        "speeding up or loss of control near the end. "
        "Provide gentle, practical feedback. "
        "Avoid harsh evaluative wording such as 'bad,' 'poor,' or numeric scores like '4/10.' "
        "Return JSON only. Do not add markdown fences or extra commentary."
    )


def build_audio_analysis_prompt(
    *,
    language: str,
    analysis_language: str,
    exercise_text: str,
) -> str:
    return (
        f"The speaker retold the following exercise text.\n\n"
        f"Language spoken: {language}\n"
        f"Feedback language: {analysis_language}\n\n"
        f"Exercise text:\n{exercise_text}\n\n"
        "Analyze the audio and return a JSON object with:\n"
        "- clarity_score: integer 0-100\n"
        "- pace_score: integer 0-100\n"
        "- hesitations: array of objects with {start: number (seconds), end: number (seconds), note: string}\n"
        "- summary: array of short, gentle observations\n"
        "- recommendations: array of 2-4 practical, encouraging suggestions"
    )
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/test_recording_prompts.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sayclearly/recording/prompts.py tests/test_recording_prompts.py
git commit -m "feat: add audio analysis prompt builders"
```

---

## Task 3: Extend Gemini Client for Audio Analysis

**Files:**
- Modify: `src/sayclearly/gemini/client.py`
- Modify: `tests/test_gemini_client.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_gemini_client.py`:

```python
from types import SimpleNamespace

import pytest

from sayclearly.gemini.client import (
    GeminiClient,
    GeminiInvalidCredentialsError,
    GeminiMalformedResponseError,
    MissingGeminiApiKeyError,
)
from sayclearly.gemini.telemetry import GeminiTelemetry
from sayclearly.recording.models import StructuredAudioAnalysis


class FakeModels:
    def __init__(self, response) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class FakeSdkClient:
    def __init__(self, response) -> None:
        self.models = FakeModels(response)


class FakeResponse:
    def __init__(self, parsed, text: str | None = None) -> None:
        self.parsed = parsed
        self.text = text


def test_analyze_audio_parses_structured_json_and_uses_model_config() -> None:
    sdk_client = FakeSdkClient(
        FakeResponse(None, text='{"clarity_score":72,"pace_score":65,"hesitations":[],"summary":["Good"],"recommendations":["Practice"]}')
    )
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    result = client.analyze_audio(
        audio_bytes=b"fake audio",
        content_type="audio/webm",
        prompt="Analyze this recording.",
        model="gemini-2.5-flash",
        thinking_level="medium",
        system_instruction="You are a coach.",
    )

    assert result.clarity_score == 72
    assert result.pace_score == 65
    call = sdk_client.models.calls[0]
    assert call["model"] == "gemini-2.5-flash"
    contents = call["contents"]
    assert len(contents) == 2
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].response_json_schema == StructuredAudioAnalysis.model_json_schema()


def test_analyze_audio_uses_thinking_level_for_default_gemini_3_models() -> None:
    sdk_client = FakeSdkClient(
        FakeResponse({"clarity_score": 80, "pace_score": 70, "hesitations": [], "summary": [], "recommendations": []})
    )
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    client.analyze_audio(
        audio_bytes=b"fake audio",
        content_type="audio/webm",
        prompt="Analyze this recording.",
        model="gemini-3-flash-preview",
        thinking_level="high",
    )

    config = sdk_client.models.calls[0]["config"]
    assert config.thinking_config.thinking_level == "HIGH"
    assert config.thinking_config.thinking_budget is None


def test_analyze_audio_rejects_malformed_response() -> None:
    sdk_client = FakeSdkClient(FakeResponse({"clarity_score": -1, "pace_score": 50, "hesitations": [], "summary": [], "recommendations": []}))
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    with pytest.raises(GeminiMalformedResponseError):
        client.analyze_audio(
            audio_bytes=b"fake audio",
            content_type="audio/webm",
            prompt="Analyze this recording.",
            model="gemini-2.5-flash",
            thinking_level="low",
        )


def test_analyze_audio_classifies_invalid_api_key_errors() -> None:
    class FakeApiError(Exception):
        def __init__(self) -> None:
            self.code = 401
            self.message = "API key not valid. Please pass a valid API key."
            super().__init__(self.message)

    sdk_client = FakeSdkClient(FakeApiError())
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    with pytest.raises(GeminiInvalidCredentialsError, match="API key"):
        client.analyze_audio(
            audio_bytes=b"fake audio",
            content_type="audio/webm",
            prompt="Analyze this recording.",
            model="gemini-2.5-flash",
            thinking_level="low",
        )
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_gemini_client.py -q`
Expected: FAIL — `analyze_audio` does not exist yet.

- [ ] **Step 3: Implement `analyze_audio`**

Add to `src/sayclearly/gemini/client.py`:

```python
from google.genai import types

from sayclearly.recording.models import StructuredAudioAnalysis


class GeminiClient:
    # ... existing __init__ and generate_exercise ...

    def analyze_audio(
        self,
        *,
        audio_bytes: bytes,
        content_type: str,
        prompt: str,
        model: str,
        thinking_level: ThinkingLevel,
        system_instruction: str | None = None,
    ) -> StructuredAudioAnalysis:
        trace = self._telemetry.start_audio_analysis(
            prompt=prompt,
            model=model,
            thinking_level=thinking_level,
        )

        try:
            response = self._sdk_client.models.generate_content(
                model=model,
                contents=[
                    types.Part.from_bytes(data=audio_bytes, mime_type=content_type),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=1,
                    response_mime_type="application/json",
                    response_json_schema=StructuredAudioAnalysis.model_json_schema(),
                    thinking_config=self._build_thinking_config(
                        model=model,
                        thinking_level=thinking_level,
                    ),
                ),
            )
        except Exception as exc:
            trace.record_error(str(exc))
            if _is_invalid_credentials_error(exc):
                raise GeminiInvalidCredentialsError(
                    "Gemini API key was rejected. Update it and try again."
                ) from exc
            raise GeminiProviderError("Gemini audio analysis request failed.") from exc

        try:
            if isinstance(response.text, str) and response.text.strip() != "":
                analysis = StructuredAudioAnalysis.model_validate_json(response.text)
            else:
                analysis = StructuredAudioAnalysis.model_validate(response.parsed)
        except Exception as exc:
            trace.record_error(str(exc))
            raise GeminiMalformedResponseError("Gemini returned malformed audio analysis.") from exc

        trace.record_success(response.text or str(response.parsed))
        return analysis
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/test_gemini_client.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sayclearly/gemini/client.py tests/test_gemini_client.py
git commit -m "feat: add Gemini audio analysis client method"
```

---

## Task 4: Extend Gemini Telemetry for Audio Analysis

**Files:**
- Modify: `src/sayclearly/gemini/telemetry.py`
- Modify: `tests/test_gemini_telemetry.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_gemini_telemetry.py`:

```python
import pytest

from sayclearly.gemini.telemetry import GeminiTelemetry


def test_start_audio_analysis_returns_trace_when_langfuse_configured(monkeypatch) -> None:
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "public-key")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "secret-key")
    monkeypatch.setenv("LANGFUSE_HOST", "https://langfuse.example")

    telemetry = GeminiTelemetry(langfuse_factory=lambda **_: FakeLangfuse())
    trace = telemetry.start_audio_analysis(
        prompt="Analyze audio",
        model="gemini-2.5-flash",
        thinking_level="medium",
    )

    assert trace is not None
    trace.record_success("done")


def test_start_audio_analysis_returns_noop_when_langfuse_not_configured() -> None:
    telemetry = GeminiTelemetry()
    trace = telemetry.start_audio_analysis(
        prompt="Analyze audio",
        model="gemini-2.5-flash",
        thinking_level="medium",
    )

    trace.record_success("done")
    assert True  # no exception means noop worked
```

(Assume `FakeLangfuse` is already defined in the existing test file; if not, add a minimal fake.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_gemini_telemetry.py -q`
Expected: FAIL — `start_audio_analysis` does not exist.

- [ ] **Step 3: Implement `start_audio_analysis`**

Add to `src/sayclearly/gemini/telemetry.py`:

```python
    def start_audio_analysis(
        self,
        *,
        prompt: str,
        model: str,
        thinking_level: ThinkingLevel,
    ) -> GeminiGenerationTrace:
        langfuse_client = self._get_langfuse_client()
        if langfuse_client is None:
            return GeminiGenerationTrace()

        try:
            observation = langfuse_client.start_observation(
                name="gemini.analyze_audio",
                as_type="generation",
                input=prompt,
                model=model,
                model_parameters={"thinking_level": thinking_level},
            )
        except Exception:
            return GeminiGenerationTrace()

        return GeminiGenerationTrace(observation, langfuse_client)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/test_gemini_telemetry.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sayclearly/gemini/telemetry.py tests/test_gemini_telemetry.py
git commit -m "feat: add Langfuse instrumentation for audio analysis"
```

---

## Task 5: Replace Recording Service Stub with Real Analysis

**Files:**
- Modify: `src/sayclearly/recording/service.py`
- Modify: `tests/test_recording_service.py`

- [ ] **Step 1: Write the failing test**

Replace `tests/test_recording_service.py` with:

```python
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from sayclearly.recording.models import AudioAnalysisMetadata, RecordingAnalysisResponse
from sayclearly.recording.service import (
    TEMP_RECORDINGS_DIR_NAME,
    EmptyRecordingError,
    RecordingService,
)
from sayclearly.storage.files import CACHE_DIR_NAME


def test_analyze_recording_saves_temp_file_and_returns_review(tmp_path: Path) -> None:
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
    saved_files = list(temp_dir.iterdir())

    assert len(saved_files) == 1
    assert saved_files[0].suffix == ".webm"
    assert isinstance(response, RecordingAnalysisResponse)
    assert response.summary
    assert response.clarity
    assert response.pace
    assert response.hesitations
    assert response.recommendations
    fake_client.analyze_audio.assert_called_once()


def test_analyze_recording_keeps_only_newest_temp_file(tmp_path: Path) -> None:
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
        audio_bytes=b"first file",
        filename="first.webm",
        content_type="audio/webm",
        metadata=metadata,
    )
    service.analyze_recording(
        audio_bytes=b"second file",
        filename="second.webm",
        content_type="audio/webm",
        metadata=metadata,
    )

    temp_dir = tmp_path / CACHE_DIR_NAME / TEMP_RECORDINGS_DIR_NAME
    saved_files = list(temp_dir.iterdir())

    assert len(saved_files) == 1
    assert saved_files[0].read_bytes() == b"second file"


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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_recording_service.py -q`
Expected: FAIL — `analyze_recording` signature changed; service does not accept metadata yet.

- [ ] **Step 3: Implement the real service**

Replace the contents of `src/sayclearly/recording/service.py`:

```python
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
from sayclearly.storage.files import CACHE_DIR_NAME, StorageError, ensure_storage_root, load_config, load_secrets

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
            f"{h['note']} (at {h['start']:.1f}s-{h['end']:.1f}s)" if 'start' in h and 'end' in h else h.get('note', '')
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/test_recording_service.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sayclearly/recording/service.py tests/test_recording_service.py
git commit -m "feat: replace recording analysis stub with Gemini orchestration"
```

---

## Task 6: Update Recording API for Multipart Metadata

**Files:**
- Modify: `src/sayclearly/recording/api.py`
- Modify: `tests/test_recording_api.py`

- [ ] **Step 1: Write the failing test**

Replace `tests/test_recording_api.py` with:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_recording_api.py -q`
Expected: FAIL — API does not accept `metadata` yet.

- [ ] **Step 3: Implement the updated API**

Replace `src/sayclearly/recording/api.py`:

```python
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from sayclearly.recording.models import AudioAnalysisMetadata, RecordingAnalysisResponse
from sayclearly.recording.service import (
    EmptyRecordingError,
    RecordingAnalysisInvalidCredentialsError,
    RecordingAnalysisProviderError,
    RecordingService,
    RecordingServiceConfigurationError,
)
from sayclearly.storage.files import StorageError


def build_recording_router(data_root: Path | None = None) -> APIRouter:
    service = RecordingService(data_root)
    router = APIRouter()

    @router.post("/api/analyze-recording", response_model=RecordingAnalysisResponse)
    async def analyze_recording(
        audio: Annotated[UploadFile, File()],
        metadata: Annotated[str, Form()] = "{}",
    ) -> RecordingAnalysisResponse:
        try:
            parsed_metadata = AudioAnalysisMetadata.model_validate_json(metadata)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            audio_bytes = await audio.read()
            return service.analyze_recording(
                audio_bytes=audio_bytes,
                filename=audio.filename,
                content_type=audio.content_type,
                metadata=parsed_metadata,
            )
        except EmptyRecordingError as exc:
            raise HTTPException(status_code=400, detail="") from exc
        except RecordingServiceConfigurationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RecordingAnalysisInvalidCredentialsError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RecordingAnalysisProviderError as exc:
            raise HTTPException(
                status_code=502,
                detail="Analysis is unavailable right now. Please try again.",
            ) from exc
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/test_recording_api.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sayclearly/recording/api.py tests/test_recording_api.py
git commit -m "feat: accept multipart metadata in recording analysis API"
```

---

## Task 7: Update Frontend to Send Metadata

**Files:**
- Modify: `src/sayclearly/static/app.ts`
- Modify: `src/sayclearly/static/dist/app.js`

- [ ] **Step 1: Update the FormData builder**

In `src/sayclearly/static/app.ts`, find the `analyzeRecordingButton` click handler and update the FormData construction:

```typescript
  elements.analyzeRecordingButton.addEventListener('click', async () => {
    if (recordedBlob === null) {
      model = applyRecordingError(model, 'No recording was captured. Please try again.');
      render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
      return;
    }

    model = startRecordingAnalysis(model);
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);

    try {
      const formData = new FormData();
      formData.append('audio', recordedBlob, 'retelling.webm');
      if (model.generated_exercise) {
        const metadata = JSON.stringify({
          language: model.generated_exercise.language,
          analysis_language: model.generated_exercise.analysis_language,
          exercise_text: model.generated_exercise.text,
        });
        formData.append('metadata', metadata);
      }
      const review = await requestJson<RecordingReview>(fetchImpl, '/api/analyze-recording', {
        method: 'POST',
        body: formData,
      });
      model = applyAnalysisResult(model, review);
    } catch {
      model = applyAnalysisError(model, 'Could not upload the recording. Try again.');
    }

    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
  });
```

- [ ] **Step 2: Rebuild frontend assets**

Run: `npm run build:frontend`
(Or the equivalent command defined in the project's `package.json`.)

- [ ] **Step 3: Commit**

```bash
git add src/sayclearly/static/app.ts src/sayclearly/static/dist/app.js
git commit -m "feat: send exercise metadata with audio analysis upload"
```

---

## Task 8: Update Integration Tests

**Files:**
- Modify: `tests/test_stage_4_flow_integration.py`

- [ ] **Step 1: Update integration assertions**

In `tests/test_stage_4_flow_integration.py`, update the audio analysis test to assert real behavior instead of the stub:

```python
def test_stage_4_analyze_recording_flow(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    client = TestClient(create_app(tmp_path))

    # Create a fake exercise first
    fake_exercise = {
        "language": "uk",
        "analysis_language": "uk",
        "topic_prompt": "test",
        "text": "The quick brown fox.",
    }

    def fake_generate_exercise(self, *, prompt, model, thinking_level):
        from sayclearly.gemini.client import GeneratedExercise
        return GeneratedExercise(text=fake_exercise["text"])

    monkeypatch.setattr(
        "sayclearly.gemini.client.GeminiClient.generate_exercise",
        fake_generate_exercise,
    )

    client.post("/api/config", json={
        "text_language": "uk",
        "analysis_language": "uk",
        "same_language_for_analysis": True,
        "ui_language": "en",
        "last_topic_prompt": "",
        "session_limit": 300,
        "keep_last_audio": False,
        "gemini": {
            "text_model": "gemini-3-flash-preview",
            "analysis_model": "gemini-3-flash-preview",
            "same_model_for_analysis": True,
            "text_thinking_level": "high",
            "api_key": "test-key",
        },
        "langfuse": {"host": None, "public_key": None, "secret_key": None},
    })

    generate_response = client.post("/api/generate-text", json={
        "language": "uk",
        "analysis_language": "uk",
        "topic_prompt": "",
        "reuse_last_topic": False,
    })
    assert generate_response.status_code == 200

    # Mock the audio analysis
    def fake_analyze_audio(self, *, audio_bytes, content_type, prompt, model, thinking_level, system_instruction=None):
        from sayclearly.recording.models import StructuredAudioAnalysis
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

    analysis_response = client.post(
        "/api/analyze-recording",
        data={"metadata": '{"language":"uk","analysis_language":"uk","exercise_text":"The quick brown fox."}'},
        files={"audio": ("sample.webm", b"fake audio", "audio/webm")},
    )

    assert analysis_response.status_code == 200
    payload = analysis_response.json()
    assert "summary" in payload
    assert "clarity" in payload
    assert "pace" in payload
    assert "hesitations" in payload
    assert "recommendations" in payload
    assert "stub" not in payload["summary"].lower()
```

- [ ] **Step 2: Run the integration test**

Run: `uv run pytest tests/test_stage_4_flow_integration.py -q`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/test_stage_4_flow_integration.py
git commit -m "test: update integration tests for real audio analysis"
```

---

## Task 9: Full Verification

- [ ] **Step 1: Run all tests**

Run: `uv run pytest -q`
Expected: PASS.

- [ ] **Step 2: Run lint and format checks**

Run:
```bash
uv run ruff check .
uv run ruff format --check .
```
Expected: PASS.

- [ ] **Step 3: Commit if clean**

```bash
git add -A
git commit -m "feat: complete Stage 6 — Gemini audio analysis"
```

---

## Self-Review

### Spec Coverage

- [x] Replace stub with real Gemini audio analysis — Tasks 3, 5
- [x] Accept multipart upload with metadata — Tasks 2, 6, 7
- [x] Resolve analysis model and API key from config/secrets — Task 5
- [x] Send audio inline to Gemini with structured JSON — Tasks 3, 5
- [x] Normalize structured response into UI format — Task 5
- [x] Add Langfuse instrumentation for audio analysis — Task 4
- [x] Keep frontend review panel unchanged — Task 7
- [x] Calm error handling for missing/invalid key, empty recording, Gemini failures — Tasks 5, 6

### Placeholder Scan

- No TODO, TBD, or "implement later" phrases remain.
- All steps include actual code, commands, and expected outcomes.

### Type Consistency

- `AudioAnalysisMetadata` fields: `language`, `analysis_language`, `exercise_text`
- `StructuredAudioAnalysis` fields: `clarity_score`, `pace_score`, `hesitations`, `summary`, `recommendations`
- `GeminiClient.analyze_audio` signature matches usage in service and tests.
- `GeminiTelemetry.start_audio_analysis` signature matches usage in client and tests.
- `RecordingService.analyze_recording` accepts `metadata: AudioAnalysisMetadata` consistently across API and service.
