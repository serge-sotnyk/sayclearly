# Stage 4 Recording And Upload Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing guided exercise shell with an explicit browser recording loop, backend upload endpoint, bounded temporary audio storage, and a stub review response shown in the same exercise screen.

**Architecture:** Keep the Stage 3 single-page shell and state-machine structure. Add a small `recording` backend domain for `POST /api/analyze-recording`, extend the frontend app model with recording and review state, and wire `MediaRecorder` into `app.ts` through a narrow injected browser-recording interface so the browser flow stays testable without real microphone automation. Commit the rebuilt frontend bundle under `src/sayclearly/static/dist/` so the Python app still runs after `uv sync` without a runtime TypeScript build step.

**Tech Stack:** Python 3.13+, FastAPI, Jinja2, Pydantic, python-multipart, pytest, Ruff, TypeScript compiler, Node built-in test runner, MediaRecorder, getUserMedia, FormData

---

## File Structure

- Modify: `pyproject.toml` - add the FastAPI multipart parsing dependency required for file uploads.
- Create: `src/sayclearly/recording/__init__.py` - empty package marker.
- Create: `src/sayclearly/recording/models.py` - typed stub review response model.
- Create: `src/sayclearly/recording/service.py` - temporary audio persistence, bounded cleanup, and deterministic stub review generation.
- Create: `src/sayclearly/recording/api.py` - `POST /api/analyze-recording` transport layer.
- Modify: `src/sayclearly/app.py` - register the recording router.
- Modify: `src/sayclearly/web/errors.py` - treat missing multipart upload body on `POST /api/analyze-recording` as `400` instead of `422`.
- Modify: `src/sayclearly/static/app_state.ts` - add recording-review state and pure transition helpers.
- Modify: `src/sayclearly/static/app.ts` - add recording controls, upload flow, inline recording errors, and review rendering.
- Modify: `src/sayclearly/templates/index.html` - add recording controls, audio preview, and review anchors inside the exercise panel.
- Modify: `src/sayclearly/static/styles.css` - style the recording controls and compact review area.
- Modify: `src/sayclearly/static/dist/app_state.js` - committed compiled output of `app_state.ts`.
- Modify: `src/sayclearly/static/dist/app.js` - committed compiled output of `app.ts`.
- Create: `tests/test_recording_service.py` - backend service tests for temp storage, cleanup, and empty upload rejection.
- Create: `tests/test_recording_api.py` - API tests for `POST /api/analyze-recording`.
- Create: `tests/test_stage_4_flow_integration.py` - flow-level backend integration test covering config, generation, and recording analysis.
- Modify: `tests/test_app_shell.py` - shell assertions for recording and review DOM hooks.
- Modify: `frontend-tests/app_state.test.js` - Node tests for recording-related state transitions.
- Modify: `frontend-tests/app.test.js` - Node tests for recording UI behavior with fake browser APIs.

### Task 1: Add The Recording Backend Domain

**Files:**
- Modify: `pyproject.toml`
- Create: `src/sayclearly/recording/__init__.py`
- Create: `src/sayclearly/recording/models.py`
- Create: `src/sayclearly/recording/service.py`
- Create: `src/sayclearly/recording/api.py`
- Modify: `src/sayclearly/app.py`
- Modify: `src/sayclearly/web/errors.py`
- Create: `tests/test_recording_service.py`
- Create: `tests/test_recording_api.py`
- Create: `tests/test_stage_4_flow_integration.py`
- Test: `tests/test_recording_service.py`
- Test: `tests/test_recording_api.py`
- Test: `tests/test_stage_4_flow_integration.py`

- [ ] **Step 1: Write the failing backend tests**

Create `tests/test_recording_service.py` with:

```python
from pathlib import Path

import pytest

from sayclearly.recording.service import EmptyRecordingError, RecordingService


def temporary_recordings_dir(root: Path) -> Path:
    return root / "cache" / "temporary-recordings"


def test_analyze_recording_saves_uploaded_audio_and_returns_stub_review(tmp_path: Path) -> None:
    response = RecordingService(tmp_path).analyze_recording(
        audio_bytes=b"voice sample",
        filename="retell.webm",
        content_type="audio/webm",
    )

    saved_files = sorted(temporary_recordings_dir(tmp_path).glob("*"))

    assert len(saved_files) == 1
    assert saved_files[0].read_bytes() == b"voice sample"
    assert response.summary
    assert response.clarity
    assert response.pace
    assert response.hesitations
    assert response.recommendations


def test_analyze_recording_removes_older_temp_files_on_next_success(tmp_path: Path) -> None:
    service = RecordingService(tmp_path)

    service.analyze_recording(
        audio_bytes=b"first sample",
        filename="first.webm",
        content_type="audio/webm",
    )
    service.analyze_recording(
        audio_bytes=b"second sample",
        filename="second.webm",
        content_type="audio/webm",
    )

    saved_files = sorted(temporary_recordings_dir(tmp_path).glob("*"))

    assert len(saved_files) == 1
    assert saved_files[0].read_bytes() == b"second sample"


def test_analyze_recording_rejects_empty_upload(tmp_path: Path) -> None:
    with pytest.raises(EmptyRecordingError, match="empty"):
        RecordingService(tmp_path).analyze_recording(
            audio_bytes=b"",
            filename="empty.webm",
            content_type="audio/webm",
        )
```

Create `tests/test_recording_api.py` with:

```python
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from sayclearly.app import create_app
from sayclearly.storage.files import StorageError


def test_post_analyze_recording_returns_stub_review(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/analyze-recording",
        files={"audio": ("retell.webm", b"voice sample", "audio/webm")},
    )

    assert response.status_code == 200
    assert response.json()["summary"]
    assert response.json()["clarity"]
    assert response.json()["pace"]
    assert response.json()["hesitations"]
    assert response.json()["recommendations"]


def test_post_analyze_recording_returns_400_when_audio_field_is_missing(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post("/api/analyze-recording", files={})

    assert response.status_code == 400
    assert response.json()["detail"][0]["loc"][0] == "body"


def test_post_analyze_recording_returns_400_for_empty_file(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/analyze-recording",
        files={"audio": ("empty.webm", b"", "audio/webm")},
    )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_post_analyze_recording_returns_500_when_storage_fails(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    with patch(
        "sayclearly.recording.api.RecordingService.analyze_recording",
        side_effect=StorageError("disk full"),
    ):
        response = client.post(
            "/api/analyze-recording",
            files={"audio": ("retell.webm", b"voice sample", "audio/webm")},
        )

    assert response.status_code == 500
    assert response.json()["detail"] == "disk full"
```

Create `tests/test_stage_4_flow_integration.py` with:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from sayclearly.app import create_app


def test_stage_4_happy_path_generates_and_analyzes_a_recording(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    config = client.get("/api/config").json()

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
        files={"audio": ("retell.webm", b"voice sample", "audio/webm")},
    )

    assert analyze_response.status_code == 200
    assert analyze_response.json()["summary"]
    assert analyze_response.json()["recommendations"]

    saved_files = sorted((tmp_path / "cache" / "temporary-recordings").glob("*"))
    assert len(saved_files) == 1
```

- [ ] **Step 2: Run the backend tests to verify they fail**

Run: `uv run pytest tests/test_recording_service.py tests/test_recording_api.py tests/test_stage_4_flow_integration.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sayclearly.recording'`.

- [ ] **Step 3: Write the minimal backend implementation**

Update `pyproject.toml` dependencies to:

```toml
dependencies = [
    "fastapi>=0.115.12",
    "jinja2>=3.1.6",
    "pydantic>=2.11.9",
    "python-multipart>=0.0.20",
    "uvicorn>=0.35.0",
]
```

Create empty `src/sayclearly/recording/__init__.py`.

Create `src/sayclearly/recording/models.py` with:

```python
from pydantic import BaseModel, ConfigDict, Field


class RecordingAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    clarity: str
    pace: str
    hesitations: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
```

Create `src/sayclearly/recording/service.py` with:

```python
from pathlib import Path
from uuid import uuid4

from sayclearly.recording.models import RecordingAnalysisResponse
from sayclearly.storage.files import CACHE_DIR_NAME, StorageError, ensure_storage_root

TEMP_RECORDINGS_DIR_NAME = "temporary-recordings"


class EmptyRecordingError(ValueError):
    """Raised when an uploaded recording has no audio payload."""


class RecordingService:
    def __init__(self, data_root: Path | None = None) -> None:
        self.data_root = data_root

    def analyze_recording(
        self,
        audio_bytes: bytes,
        filename: str | None,
        content_type: str | None,
    ) -> RecordingAnalysisResponse:
        if len(audio_bytes) == 0:
            raise EmptyRecordingError("Uploaded recording is empty.")

        recording_path = self._write_temporary_recording(audio_bytes, filename, content_type)
        self._cleanup_older_recordings(recording_path)
        return self._build_stub_review()

    def _recordings_dir(self) -> Path:
        root = ensure_storage_root(self.data_root)
        directory = root / CACHE_DIR_NAME / TEMP_RECORDINGS_DIR_NAME
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    def _write_temporary_recording(
        self,
        audio_bytes: bytes,
        filename: str | None,
        content_type: str | None,
    ) -> Path:
        del content_type
        suffix = Path(filename or "retelling.webm").suffix or ".webm"
        path = self._recordings_dir() / f"recording-{uuid4().hex}{suffix}"

        try:
            path.write_bytes(audio_bytes)
        except OSError as exc:
            raise StorageError(f"Could not write {path}") from exc

        return path

    def _cleanup_older_recordings(self, keep_path: Path) -> None:
        for path in self._recordings_dir().iterdir():
            if path == keep_path or not path.is_file():
                continue
            try:
                path.unlink()
            except OSError:
                continue

    def _build_stub_review(self) -> RecordingAnalysisResponse:
        return RecordingAnalysisResponse(
            summary="Clear overall retelling with room to slow down at phrase endings.",
            clarity="Mostly clear consonants with a few softer endings near the finish.",
            pace="Comfortable pace overall, with a small speed-up toward the end.",
            hesitations=[
                "One short restart appeared near the middle of the retelling.",
            ],
            recommendations=[
                "Pause a fraction longer between the main ideas.",
                "Keep the final words of each phrase as clear as the opening words.",
            ],
        )
```

Create `src/sayclearly/recording/api.py` with:

```python
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from sayclearly.recording.models import RecordingAnalysisResponse
from sayclearly.recording.service import EmptyRecordingError, RecordingService
from sayclearly.storage.files import StorageError


def build_recording_router(data_root: Path | None = None) -> APIRouter:
    service = RecordingService(data_root)
    router = APIRouter()

    @router.post("/api/analyze-recording", response_model=RecordingAnalysisResponse)
    async def analyze_recording(audio: UploadFile = File(...)) -> RecordingAnalysisResponse:
        try:
            audio_bytes = await audio.read()
            return service.analyze_recording(
                audio_bytes=audio_bytes,
                filename=audio.filename,
                content_type=audio.content_type,
            )
        except EmptyRecordingError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
```

Update `src/sayclearly/app.py` imports and router setup to:

```python
from sayclearly.config.api import build_config_router
from sayclearly.exercise.api import build_exercise_router
from sayclearly.history.api import build_history_router
from sayclearly.recording.api import build_recording_router
from sayclearly.web.errors import install_error_handlers


def create_app(data_root: Path | None = None) -> FastAPI:
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    app = FastAPI(
        title="SayClearly",
    )

    install_error_handlers(app)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.include_router(build_config_router(data_root))
    app.include_router(build_exercise_router(data_root))
    app.include_router(build_history_router(data_root))
    app.include_router(build_recording_router(data_root))
```

Update `src/sayclearly/web/errors.py` route set to:

```python
BAD_REQUEST_VALIDATION_ROUTES = {
    ("POST", "/api/config"),
    ("POST", "/api/history"),
    ("POST", "/api/analyze-recording"),
}
```

- [ ] **Step 4: Run the backend tests to verify they pass**

Run: `uv sync && uv run pytest tests/test_recording_service.py tests/test_recording_api.py tests/test_stage_4_flow_integration.py -v`
Expected: PASS for all recording service, API, and flow integration tests.

- [ ] **Step 5: Commit the backend upload slice**

```bash
git add pyproject.toml src/sayclearly/recording/__init__.py src/sayclearly/recording/models.py src/sayclearly/recording/service.py src/sayclearly/recording/api.py src/sayclearly/app.py src/sayclearly/web/errors.py tests/test_recording_service.py tests/test_recording_api.py tests/test_stage_4_flow_integration.py
git commit -m "feat: add recording upload endpoint"
```

### Task 2: Extend The Frontend State Model For Recording

**Files:**
- Modify: `src/sayclearly/static/app_state.ts`
- Modify: `frontend-tests/app_state.test.js`
- Modify: `src/sayclearly/static/dist/app_state.js`
- Test: `frontend-tests/app_state.test.js`

- [ ] **Step 1: Write the failing frontend state tests**

Update `frontend-tests/app_state.test.js` imports to:

```javascript
import {
  applyAnalysisError,
  applyAnalysisResult,
  applyGeneratedExercise,
  applyGenerationError,
  applyLoadedConfig,
  advanceExerciseStep,
  buildConfigUpdatePayload,
  buildGenerateRequest,
  createInitialAppModel,
  markRecordingStarted,
  resetRecording,
  startRecordingAnalysis,
  startRecordingRequest,
  storeRecordedAudio,
  syncAnalysisLanguage,
} from '../src/sayclearly/static/dist/app_state.js';
```

Append these tests to `frontend-tests/app_state.test.js`:

```javascript
const review = {
  summary: 'Clear overall retelling.',
  clarity: 'Mostly clear consonants.',
  pace: 'Comfortable pace overall.',
  hesitations: ['One short restart near the middle.'],
  recommendations: ['Pause slightly longer between the main ideas.'],
};

function createRetellingReadyModel() {
  const exercise = {
    language: 'uk',
    analysis_language: 'uk',
    topic_prompt: 'Morning routines',
    text: 'Read slowly, then naturally, then retell it from memory.',
  };

  const stepOne = applyGeneratedExercise(createInitialAppModel(), exercise);
  const stepTwo = advanceExerciseStep(stepOne);
  return advanceExerciseStep(stepTwo);
}

test('startRecordingRequest moves retelling state into requesting_microphone and clears stale review', () => {
  const model = {
    ...createRetellingReadyModel(),
    has_recording: true,
    recording_error: 'Old microphone error',
    review,
  };

  const updatedModel = startRecordingRequest(model);

  assert.equal(updatedModel.flow, 'requesting_microphone');
  assert.equal(updatedModel.has_recording, false);
  assert.equal(updatedModel.recording_error, null);
  assert.equal(updatedModel.review, null);
});

test('storeRecordedAudio marks the retelling as ready for upload', () => {
  const updatedModel = storeRecordedAudio(markRecordingStarted(startRecordingRequest(createRetellingReadyModel())));

  assert.equal(updatedModel.flow, 'recorded');
  assert.equal(updatedModel.has_recording, true);
  assert.equal(updatedModel.recording_error, null);
});

test('applyAnalysisError returns to recorded state and keeps retry available', () => {
  const recordedModel = storeRecordedAudio(
    markRecordingStarted(startRecordingRequest(createRetellingReadyModel())),
  );

  const updatedModel = applyAnalysisError(startRecordingAnalysis(recordedModel), 'Upload failed');

  assert.equal(updatedModel.flow, 'recorded');
  assert.equal(updatedModel.has_recording, true);
  assert.equal(updatedModel.recording_error, 'Upload failed');
});

test('applyAnalysisResult enters review and resetRecording returns to retelling readiness', () => {
  const recordedModel = storeRecordedAudio(
    markRecordingStarted(startRecordingRequest(createRetellingReadyModel())),
  );
  const reviewedModel = applyAnalysisResult(startRecordingAnalysis(recordedModel), review);
  const resetModel = resetRecording(reviewedModel);

  assert.equal(reviewedModel.flow, 'review');
  assert.deepEqual(reviewedModel.review, review);
  assert.equal(resetModel.flow, 'step_3_retell_ready');
  assert.equal(resetModel.has_recording, false);
  assert.equal(resetModel.recording_error, null);
  assert.equal(resetModel.review, null);
});
```

- [ ] **Step 2: Run the frontend state tests to verify they fail**

Run: `npm run build:frontend && node --test frontend-tests/app_state.test.js`
Expected: FAIL with missing exports such as `startRecordingRequest` or `applyAnalysisResult`.

- [ ] **Step 3: Write the minimal frontend state implementation**

Update `src/sayclearly/static/app_state.ts` type definitions to:

```typescript
export type FlowState =
  | 'home'
  | 'generating_text'
  | 'step_1_slow'
  | 'step_2_natural'
  | 'step_3_retell_ready'
  | 'requesting_microphone'
  | 'recording'
  | 'recorded'
  | 'analyzing'
  | 'review'
  | 'error';

export interface RecordingReview {
  summary: string;
  clarity: string;
  pace: string;
  hesitations: string[];
  recommendations: string[];
}

export interface AppModel {
  flow: FlowState;
  config: PublicConfig;
  settings: SettingsFormState;
  generated_exercise: GeneratedExercise | null;
  error_message: string | null;
  has_recording: boolean;
  recording_error: string | null;
  review: RecordingReview | null;
}
```

Update `createInitialAppModel()` and `applyGeneratedExercise()` to:

```typescript
export function createInitialAppModel(): AppModel {
  return {
    flow: 'home',
    config: DEFAULT_CONFIG,
    settings: buildSettingsFromConfig(DEFAULT_CONFIG),
    generated_exercise: null,
    error_message: null,
    has_recording: false,
    recording_error: null,
    review: null,
  };
}

export function applyGeneratedExercise(model: AppModel, exercise: GeneratedExercise): AppModel {
  return {
    ...model,
    flow: 'step_1_slow',
    generated_exercise: exercise,
    error_message: null,
    has_recording: false,
    recording_error: null,
    review: null,
  };
}
```

Append these pure transition helpers to `src/sayclearly/static/app_state.ts`:

```typescript
export function startRecordingRequest(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'requesting_microphone',
    has_recording: false,
    recording_error: null,
    review: null,
  };
}

export function markRecordingStarted(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'recording',
    recording_error: null,
  };
}

export function storeRecordedAudio(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'recorded',
    has_recording: true,
    recording_error: null,
  };
}

export function applyRecordingError(model: AppModel, message: string): AppModel {
  return {
    ...model,
    flow: 'step_3_retell_ready',
    has_recording: false,
    recording_error: message,
    review: null,
  };
}

export function startRecordingAnalysis(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'analyzing',
    recording_error: null,
  };
}

export function applyAnalysisResult(model: AppModel, review: RecordingReview): AppModel {
  return {
    ...model,
    flow: 'review',
    has_recording: true,
    recording_error: null,
    review,
  };
}

export function applyAnalysisError(model: AppModel, message: string): AppModel {
  return {
    ...model,
    flow: 'recorded',
    has_recording: true,
    recording_error: message,
  };
}

export function resetRecording(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'step_3_retell_ready',
    has_recording: false,
    recording_error: null,
    review: null,
  };
}
```

- [ ] **Step 4: Rebuild the frontend state bundle and verify the tests pass**

Run: `npm run build:frontend && node --test frontend-tests/app_state.test.js`
Expected: PASS for the recording-related state helpers and the existing Stage 3 state tests.

- [ ] **Step 5: Commit the recording state slice**

```bash
git add src/sayclearly/static/app_state.ts src/sayclearly/static/dist/app_state.js frontend-tests/app_state.test.js
git commit -m "feat: add recording state transitions"
```

### Task 3: Add Recording And Review Markup To The Shell

**Files:**
- Modify: `src/sayclearly/templates/index.html`
- Modify: `src/sayclearly/static/styles.css`
- Modify: `tests/test_app_shell.py`
- Test: `tests/test_app_shell.py`

- [ ] **Step 1: Write the failing shell test**

Append this test to `tests/test_app_shell.py`:

```python
def test_home_page_renders_stage_4_recording_hooks() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "data-recording-controls" in response.text
    assert "data-recording-status" in response.text
    assert "data-start-recording-button" in response.text
    assert "data-stop-recording-button" in response.text
    assert "data-recording-preview" in response.text
    assert "data-analyze-recording-button" in response.text
    assert "data-record-again-button" in response.text
    assert "data-review-panel" in response.text
    assert "data-review-summary" in response.text
    assert "data-review-clarity" in response.text
    assert "data-review-pace" in response.text
    assert "data-review-hesitations" in response.text
    assert "data-review-recommendations" in response.text
```

- [ ] **Step 2: Run the shell test to verify it fails**

Run: `uv run pytest tests/test_app_shell.py -v`
Expected: FAIL because the new recording and review hooks are not yet present in `index.html`.

- [ ] **Step 3: Add the recording and review anchors to the shell**

Update the exercise section in `src/sayclearly/templates/index.html` to:

```html
        <section class="panel screen-panel" data-screen="exercise" aria-labelledby="exercise-title">
          <div class="panel-heading">
            <p class="step-label" data-step-label>Step 1 of 3</p>
            <h2 id="exercise-title" data-step-title>Warm-up response</h2>
            <p class="step-instruction" data-step-instruction>Read the prompt out loud once, then repeat it with a slower and clearer pace.</p>
          </div>

          <div class="exercise-text" aria-live="polite" data-exercise-text>
            Your generated exercise text will appear here when the frontend bundle is connected.
          </div>

          <div class="recording-panel" data-recording-controls>
            <p class="recording-status" data-recording-status>Recording becomes available when you reach the retelling step.</p>
            <div class="button-row">
              <button type="button" class="button button-primary" data-start-recording-button hidden>Start recording</button>
              <button type="button" class="button button-primary" data-stop-recording-button hidden>Stop recording</button>
              <button type="button" class="button button-primary" data-analyze-recording-button hidden>Analyze recording</button>
              <button type="button" class="button button-secondary" data-record-again-button hidden>Record again</button>
            </div>
            <audio controls hidden data-recording-preview></audio>
          </div>

          <div class="review-panel" data-review-panel hidden>
            <p class="section-kicker">Review</p>
            <p class="review-copy" data-review-summary></p>
            <p class="review-copy" data-review-clarity></p>
            <p class="review-copy" data-review-pace></p>
            <p class="review-copy" data-review-hesitations></p>
            <p class="review-copy" data-review-recommendations></p>
          </div>

          <div class="button-row">
            <button type="button" class="button button-secondary" data-reset-button>Reset</button>
            <button type="button" class="button button-primary" data-next-step-button>Next step</button>
          </div>
        </section>
```

Append these styles to `src/sayclearly/static/styles.css`:

```css
.recording-panel,
.review-panel {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 1rem;
    padding: 1rem;
    border-radius: 1rem;
    background: rgba(252, 249, 243, 0.92);
    border: 1px solid rgba(124, 92, 43, 0.16);
}

.recording-status,
.review-copy {
    margin: 0;
    color: #52606d;
    line-height: 1.6;
}

audio[data-recording-preview] {
    width: 100%;
}
```

- [ ] **Step 4: Re-run the shell test to verify it passes**

Run: `uv run pytest tests/test_app_shell.py -v`
Expected: PASS for the existing shell assertions and the new recording-review hook test.

- [ ] **Step 5: Commit the shell markup slice**

```bash
git add src/sayclearly/templates/index.html src/sayclearly/static/styles.css tests/test_app_shell.py
git commit -m "feat: add recording controls to shell"
```

### Task 4: Wire Recording, Upload, And Review In The Frontend App

**Files:**
- Modify: `src/sayclearly/static/app.ts`
- Modify: `frontend-tests/app.test.js`
- Modify: `src/sayclearly/static/dist/app.js`
- Test: `frontend-tests/app.test.js`

- [ ] **Step 1: Write the failing frontend app tests**

In `frontend-tests/app.test.js`, extend `FakeElement` to support audio preview URLs:

```javascript
class FakeElement {
  constructor(initial = {}) {
    this.value = initial.value ?? '';
    this.checked = initial.checked ?? false;
    this.hidden = initial.hidden ?? false;
    this.textContent = initial.textContent ?? '';
    this.disabled = initial.disabled ?? false;
    this.src = initial.src ?? '';
    this.listeners = new Map();
    this.classList = new FakeClassList();
  }
```

Update `createShell()` so its element map includes:

```javascript
    ['[data-recording-controls]', new FakeElement()],
    ['[data-recording-status]', new FakeElement()],
    ['[data-start-recording-button]', new FakeElement({ hidden: true })],
    ['[data-stop-recording-button]', new FakeElement({ hidden: true })],
    ['[data-analyze-recording-button]', new FakeElement({ hidden: true })],
    ['[data-record-again-button]', new FakeElement({ hidden: true })],
    ['[data-recording-preview]', new FakeElement({ hidden: true })],
    ['[data-review-panel]', new FakeElement({ hidden: true })],
    ['[data-review-summary]', new FakeElement()],
    ['[data-review-clarity]', new FakeElement()],
    ['[data-review-pace]', new FakeElement()],
    ['[data-review-hesitations]', new FakeElement()],
    ['[data-review-recommendations]', new FakeElement()],
```

Append these helpers and tests to `frontend-tests/app.test.js`:

```javascript
class FakeRecorder {
  constructor(blob) {
    this.blob = blob;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  start() {}

  stop() {
    for (const listener of this.listeners.get('dataavailable') ?? []) {
      listener({ data: this.blob });
    }
    for (const listener of this.listeners.get('stop') ?? []) {
      listener();
    }
  }
}

function createRecordingApi(recordedBlob = new Blob(['voice sample'], { type: 'audio/webm' })) {
  return {
    isSupported() {
      return true;
    },
    async getUserMedia() {
      return { kind: 'stream' };
    },
    createMediaRecorder() {
      return new FakeRecorder(recordedBlob);
    },
    createObjectURL() {
      return 'blob:retelling';
    },
    revokeObjectURL() {},
  };
}

test('startApp records, uploads, renders review, and clears review on record again', async () => {
  const shell = createShell();
  const config = createConfig();
  const exercise = createExercise();
  const review = {
    summary: 'Clear overall retelling.',
    clarity: 'Mostly clear consonants.',
    pace: 'Comfortable pace overall.',
    hesitations: ['One short restart near the middle.'],
    recommendations: ['Pause slightly longer between the main ideas.'],
  };
  const { fetchStub, calls } = createFetchStub(
    createResponse(config),
    createResponse(config),
    createResponse(exercise),
    createResponse(review),
  );

  await startApp(shell.document, fetchStub, createRecordingApi());

  await shell.elements.get('[data-generate-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-start-recording-button]').click();

  assert.match(shell.elements.get('[data-recording-status]').textContent, /recording in progress/i);

  await shell.elements.get('[data-stop-recording-button]').click();

  assert.equal(shell.elements.get('[data-recording-preview]').hidden, false);
  assert.equal(shell.elements.get('[data-recording-preview]').src, 'blob:retelling');

  await shell.elements.get('[data-analyze-recording-button]').click();

  assert.equal(calls[3].url, '/api/analyze-recording');
  assert.equal(shell.elements.get('[data-review-panel]').hidden, false);
  assert.match(shell.elements.get('[data-review-summary]').textContent, /clear overall/i);

  await shell.elements.get('[data-record-again-button]').click();

  assert.equal(shell.elements.get('[data-review-panel]').hidden, true);
  assert.equal(shell.elements.get('[data-recording-preview]').hidden, true);
});

test('startApp preserves the recorded retelling when upload fails', async () => {
  const shell = createShell();
  const config = createConfig();
  const exercise = createExercise();
  const { fetchStub } = createFetchStub(
    createResponse(config),
    createResponse(config),
    createResponse(exercise),
    new Error('upload failed'),
  );

  await startApp(shell.document, fetchStub, createRecordingApi());

  await shell.elements.get('[data-generate-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-start-recording-button]').click();
  await shell.elements.get('[data-stop-recording-button]').click();
  await shell.elements.get('[data-analyze-recording-button]').click();

  assert.equal(shell.elements.get('[data-recording-preview]').hidden, false);
  assert.equal(shell.elements.get('[data-analyze-recording-button]').hidden, false);
  assert.match(shell.elements.get('[data-recording-status]').textContent, /could not upload/i);
});
```

- [ ] **Step 2: Run the frontend app tests to verify they fail**

Run: `npm run test:frontend`
Expected: FAIL because `app.ts` does not yet read the new recording elements or accept the injected recording API.

- [ ] **Step 3: Implement the browser recording and upload loop**

Update the `src/sayclearly/static/app.ts` imports to:

```typescript
import {
  advanceExerciseStep,
  applyAnalysisError,
  applyAnalysisResult,
  applyGeneratedExercise,
  applyGenerationError,
  applyLoadedConfig,
  applyRecordingError,
  buildConfigUpdatePayload,
  buildGenerateRequest,
  createInitialAppModel,
  markRecordingStarted,
  resetRecording,
  startRecordingAnalysis,
  startRecordingRequest,
  storeRecordedAudio,
  syncAnalysisLanguage,
  type AppModel,
  type GeneratedExercise,
  type PublicConfig,
  type RecordingReview,
  type SettingsFormState,
} from './app_state.js';
```

Add these recording API types and default implementation near the top of `src/sayclearly/static/app.ts`:

```typescript
interface RecorderLike {
  addEventListener(type: 'dataavailable' | 'stop', listener: (event: { data?: Blob }) => void): void;
  start(): void;
  stop(): void;
}

interface RecordingApi {
  isSupported(): boolean;
  getUserMedia(): Promise<unknown>;
  createMediaRecorder(stream: unknown): RecorderLike;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

function createDefaultRecordingApi(): RecordingApi {
  return {
    isSupported() {
      return typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof MediaRecorder !== 'undefined';
    },
    async getUserMedia() {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    },
    createMediaRecorder(stream: unknown) {
      return new MediaRecorder(stream as MediaStream);
    },
    createObjectURL(blob: Blob) {
      return URL.createObjectURL(blob);
    },
    revokeObjectURL(url: string) {
      URL.revokeObjectURL(url);
    },
  };
}
```

Extend `ShellElements` and `collectShellElements()` with:

```typescript
  recordingControls: HTMLElement;
  recordingStatus: HTMLElement;
  startRecordingButton: HTMLButtonElement;
  stopRecordingButton: HTMLButtonElement;
  analyzeRecordingButton: HTMLButtonElement;
  recordAgainButton: HTMLButtonElement;
  recordingPreview: HTMLAudioElement;
  reviewPanel: HTMLElement;
  reviewSummary: HTMLElement;
  reviewClarity: HTMLElement;
  reviewPace: HTMLElement;
  reviewHesitations: HTMLElement;
  reviewRecommendations: HTMLElement;
```

```typescript
    recordingControls: getRequiredElement(root, '[data-recording-controls]'),
    recordingStatus: getRequiredElement(root, '[data-recording-status]'),
    startRecordingButton: getRequiredElement(root, '[data-start-recording-button]'),
    stopRecordingButton: getRequiredElement(root, '[data-stop-recording-button]'),
    analyzeRecordingButton: getRequiredElement(root, '[data-analyze-recording-button]'),
    recordAgainButton: getRequiredElement(root, '[data-record-again-button]'),
    recordingPreview: getRequiredElement(root, '[data-recording-preview]'),
    reviewPanel: getRequiredElement(root, '[data-review-panel]'),
    reviewSummary: getRequiredElement(root, '[data-review-summary]'),
    reviewClarity: getRequiredElement(root, '[data-review-clarity]'),
    reviewPace: getRequiredElement(root, '[data-review-pace]'),
    reviewHesitations: getRequiredElement(root, '[data-review-hesitations]'),
    reviewRecommendations: getRequiredElement(root, '[data-review-recommendations]'),
```

Update `requestJson()` so it does not force JSON headers onto `FormData` uploads:

```typescript
async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  options?: RequestInit,
): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  const headers = isFormData
    ? { ...(options?.headers ?? {}) }
    : {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      };

  const response = await fetchImpl(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${url}`);
  }

  return (await response.json()) as T;
}
```

Change the `startApp()` signature and add local recording artifacts:

```typescript
export async function startApp(
  documentRef: Document = document,
  fetchImpl: typeof fetch = fetch,
  recordingApi: RecordingApi = createDefaultRecordingApi(),
): Promise<void> {
  const root = documentRef.querySelector('[data-app-root]') as RootLike | null;
  if (!root) {
    return;
  }

  const elements = collectShellElements(root);
  let model = createInitialAppModel();
  let isSettingsOpen = false;
  let reuseNextGeneration = false;
  let activeRecorder: RecorderLike | null = null;
  let recordedBlob: Blob | null = null;
  let recordedUrl: string | null = null;
```

Add this helper inside `startApp()` to clear local recording artifacts:

```typescript
  const clearRecordingArtifacts = (): void => {
    activeRecorder = null;
    recordedBlob = null;
    if (recordedUrl) {
      recordingApi.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }
  };
```

Update `render()` so it manages recording and review visibility:

```typescript
  const isRetellingStage = [
    'step_3_retell_ready',
    'requesting_microphone',
    'recording',
    'recorded',
    'analyzing',
    'review',
  ].includes(model.flow);

  elements.recordingControls.hidden = !hasExercise || !isRetellingStage;
  elements.recordingStatus.textContent =
    model.recording_error ??
    (model.flow === 'requesting_microphone'
      ? 'Waiting for microphone access...'
      : model.flow === 'recording'
        ? 'Recording in progress. Stop when you finish the retelling.'
        : model.flow === 'analyzing'
          ? 'Uploading the recording for review...'
          : model.has_recording
            ? 'Listen back, analyze the retelling, or record it again.'
            : 'Use the retelling step to record your final run.');

  elements.startRecordingButton.hidden = model.flow !== 'step_3_retell_ready';
  elements.stopRecordingButton.hidden = model.flow !== 'recording';
  elements.analyzeRecordingButton.hidden = model.flow !== 'recorded';
  elements.recordAgainButton.hidden = !(model.flow === 'recorded' || model.flow === 'review');
  elements.analyzeRecordingButton.disabled = model.flow === 'analyzing';
  elements.recordAgainButton.disabled = model.flow === 'analyzing';
  elements.recordingPreview.hidden = recordedUrl === null;
  elements.recordingPreview.src = recordedUrl ?? '';

  elements.reviewPanel.hidden = model.review === null;
  elements.reviewSummary.textContent = model.review ? `Summary: ${model.review.summary}` : '';
  elements.reviewClarity.textContent = model.review ? `Clarity: ${model.review.clarity}` : '';
  elements.reviewPace.textContent = model.review ? `Pace: ${model.review.pace}` : '';
  elements.reviewHesitations.textContent = model.review
    ? `Hesitations: ${model.review.hesitations.join(' ')}`
    : '';
  elements.reviewRecommendations.textContent = model.review
    ? `Recommendations: ${model.review.recommendations.join(' ')}`
    : '';

  elements.nextStepButton.hidden = isRetellingStage;
```

Add these event handlers inside `startApp()` after the existing step-navigation listeners:

```typescript
  elements.startRecordingButton.addEventListener('click', async () => {
    if (!recordingApi.isSupported()) {
      model = applyRecordingError(model, 'This browser does not support microphone recording.');
      render(elements, model, isSettingsOpen, reuseNextGeneration);
      return;
    }

    model = startRecordingRequest(model);
    render(elements, model, isSettingsOpen, reuseNextGeneration);

    try {
      const stream = await recordingApi.getUserMedia();
      const recorder = recordingApi.createMediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunks, { type: chunks[0]?.type ?? 'audio/webm' });

        if (blob.size === 0) {
          clearRecordingArtifacts();
          model = applyRecordingError(model, 'No recording was captured. Please try again.');
          render(elements, model, isSettingsOpen, reuseNextGeneration);
          return;
        }

        clearRecordingArtifacts();
        recordedBlob = blob;
        recordedUrl = recordingApi.createObjectURL(blob);
        model = storeRecordedAudio(model);
        render(elements, model, isSettingsOpen, reuseNextGeneration);
      });

      activeRecorder = recorder;
      recorder.start();
      model = markRecordingStarted(model);
    } catch {
      clearRecordingArtifacts();
      model = applyRecordingError(model, 'Microphone access was unavailable. Please try again.');
    }

    render(elements, model, isSettingsOpen, reuseNextGeneration);
  });

  elements.stopRecordingButton.addEventListener('click', () => {
    activeRecorder?.stop();
  });

  elements.analyzeRecordingButton.addEventListener('click', async () => {
    if (!recordedBlob) {
      model = applyRecordingError(model, 'No recording was captured. Please try again.');
      render(elements, model, isSettingsOpen, reuseNextGeneration);
      return;
    }

    model = startRecordingAnalysis(model);
    render(elements, model, isSettingsOpen, reuseNextGeneration);

    const formData = new FormData();
    formData.append('audio', recordedBlob, 'retelling.webm');

    try {
      const review = await requestJson<RecordingReview>(fetchImpl, '/api/analyze-recording', {
        method: 'POST',
        body: formData,
      });
      model = applyAnalysisResult(model, review);
    } catch {
      model = applyAnalysisError(model, 'Could not upload the recording. Try again.');
    }

    render(elements, model, isSettingsOpen, reuseNextGeneration);
  });

  elements.recordAgainButton.addEventListener('click', () => {
    clearRecordingArtifacts();
    model = resetRecording(model);
    render(elements, model, isSettingsOpen, reuseNextGeneration);
  });
```

Update the existing reset handler inside `startApp()` to clear local recording artifacts before rebuilding the home model:

```typescript
  elements.resetButton.addEventListener('click', () => {
    reuseNextGeneration = false;
    clearRecordingArtifacts();
    const resetModel = createInitialAppModel();
    model = applyLoadedConfig(resetModel, model.config);
    render(elements, model, isSettingsOpen, reuseNextGeneration);
  });
```

- [ ] **Step 4: Rebuild the frontend bundle and verify the full frontend tests pass**

Run: `npm run test:frontend`
Expected: PASS for both `frontend-tests/app_state.test.js` and `frontend-tests/app.test.js` with the rebuilt `dist` bundle.

- [ ] **Step 5: Commit the frontend recording loop slice**

```bash
git add src/sayclearly/static/app.ts src/sayclearly/static/dist/app.js src/sayclearly/static/dist/app_state.js frontend-tests/app.test.js
git commit -m "feat: add browser recording flow"
```

### Task 5: Run Full Verification And Create The Final Stage 4 Commit

**Files:**
- Modify: `src/sayclearly/static/dist/app_state.js`
- Modify: `src/sayclearly/static/dist/app.js`
- Test: `frontend-tests/*.test.js`
- Test: `tests/*.py`

- [ ] **Step 1: Rebuild the committed frontend bundle from the final TypeScript sources**

Run: `npm run build:frontend`
Expected: PASS and updated `src/sayclearly/static/dist/app.js` and `src/sayclearly/static/dist/app_state.js` on disk.

- [ ] **Step 2: Run the full verification suite**

Run: `npm run test:frontend && uv run pytest && uv run ruff check . && uv run ruff format --check .`
Expected: PASS for frontend build and tests, Python tests, Ruff lint, and Ruff format check.

- [ ] **Step 3: Commit the verified Stage 4 implementation**

```bash
git add pyproject.toml src/sayclearly/recording/__init__.py src/sayclearly/recording/models.py src/sayclearly/recording/service.py src/sayclearly/recording/api.py src/sayclearly/app.py src/sayclearly/web/errors.py src/sayclearly/static/app_state.ts src/sayclearly/static/app.ts src/sayclearly/templates/index.html src/sayclearly/static/styles.css src/sayclearly/static/dist/app_state.js src/sayclearly/static/dist/app.js tests/test_recording_service.py tests/test_recording_api.py tests/test_stage_4_flow_integration.py tests/test_app_shell.py frontend-tests/app_state.test.js frontend-tests/app.test.js
git commit -m "feat: add stage 4 recording flow"
```
