# Stage 7 Review and History Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect completed recording reviews to persistent local history, add a history browser inside the existing single-page shell, and allow reusing topics from both the current review and previous sessions.

**Architecture:** Keep the current backend boundaries intact: `recording/` returns both display-ready review text and persisted analysis data, while `history/` continues to own storage. Extend the existing frontend state machine with a `history` flow, on-demand history fetches, and review/history actions, while preserving the one-page shell and current FastAPI + Jinja + TypeScript structure.

**Tech Stack:** Python 3.13+, FastAPI, Pydantic, pytest, Jinja2, plain TypeScript, committed `static/dist` JavaScript bundle

---

## File Structure

- **Modify:** `src/sayclearly/recording/models.py` — add the combined analysis response model that carries both review text and persisted analysis data.
- **Modify:** `src/sayclearly/recording/service.py` — normalize Gemini output into `review` + `analysis` instead of review-only text.
- **Modify:** `src/sayclearly/recording/api.py` — expose the expanded analysis response contract.
- **Modify:** `src/sayclearly/static/app_state.ts` — add history data types, state fields, and transition helpers.
- **Modify:** `src/sayclearly/static/app.ts` — save analyzed sessions to history, load history list/details, and wire new review/history actions.
- **Modify:** `src/sayclearly/static/dist/app_state.js` — committed transpiled output matching `app_state.ts`.
- **Modify:** `src/sayclearly/static/dist/app.js` — committed transpiled output matching `app.ts`.
- **Modify:** `src/sayclearly/templates/index.html` — add review action buttons and the history screen structure.
- **Modify:** `src/sayclearly/static/styles.css` — style the review actions and history list/details layout.
- **Modify:** `tests/test_recording_service.py` — cover the combined review + persisted analysis normalization.
- **Modify:** `tests/test_recording_api.py` — cover the expanded response body.
- **Modify:** `tests/test_stage_4_flow_integration.py` — update the analysis assertions for the new response shape.
- **Modify:** `tests/test_history_api.py` — add empty-history coverage.
- **Modify:** `tests/test_app_shell.py` — assert Stage 7 DOM hooks are rendered.
- **Create:** `tests/test_stage_7_flow_integration.py` — cover analyze -> save history -> list -> details -> reuse-topic backend flow.

---

### Task 1: Expand The Analysis Response Contract

**Files:**
- Modify: `src/sayclearly/recording/models.py`
- Modify: `src/sayclearly/recording/service.py`
- Modify: `src/sayclearly/recording/api.py`
- Modify: `tests/test_recording_service.py`
- Modify: `tests/test_recording_api.py`
- Modify: `tests/test_stage_4_flow_integration.py`

- [ ] **Step 1: Write the failing service and API tests**

Update `tests/test_recording_service.py` to expect a combined response object:

```python
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from sayclearly.recording.models import AudioAnalysisMetadata, RecordingAnalysisResult
from sayclearly.recording.service import (
    TEMP_RECORDINGS_DIR_NAME,
    EmptyRecordingError,
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
    saved_files = list(temp_dir.iterdir())

    assert len(saved_files) == 1
    assert saved_files[0].suffix == ".webm"
    assert isinstance(response, RecordingAnalysisResult)
    assert response.review.summary
    assert response.review.clarity
    assert response.review.pace
    assert response.review.recommendations == ["Slow down a little."]
    assert response.analysis.clarity_score == 72
    assert response.analysis.pace_score == 65
    assert response.analysis.summary == ["Tempo increased near the end."]
    assert response.analysis.hesitations[0].note == "pause"
    fake_client.analyze_audio.assert_called_once()
```

Update `tests/test_recording_api.py` to expect `review` and `analysis`:

```python
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from sayclearly.app import create_app
from sayclearly.storage.files import StorageError


def test_post_analyze_recording_returns_review_and_analysis_with_metadata(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    with patch(
        "sayclearly.recording.api.RecordingService.analyze_recording",
        return_value={
            "review": {
                "summary": "Good effort.",
                "clarity": "Clear.",
                "pace": "Steady.",
                "hesitations": [],
                "recommendations": ["Keep practicing."],
            },
            "analysis": {
                "clarity_score": 72,
                "pace_score": 65,
                "hesitations": [],
                "summary": ["Good effort."],
            },
        },
    ):
        response = client.post(
            "/api/analyze-recording",
            data={"metadata": '{"language":"uk","analysis_language":"uk","exercise_text":"Fox"}'},
            files={"audio": ("sample.webm", b"fake webm bytes", "audio/webm")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["review"]["summary"] == "Good effort."
    assert payload["analysis"]["clarity_score"] == 72
```

Update the analyze assertions in `tests/test_stage_4_flow_integration.py`:

```python
    assert analyze_response.status_code == 200
    payload = analyze_response.json()
    assert payload["review"]["summary"]
    assert payload["review"]["recommendations"]
    assert payload["analysis"]["summary"] == ["Good effort."]
    assert payload["analysis"]["hesitations"][0]["note"] == "pause"
```

- [ ] **Step 2: Run the targeted tests to verify they fail first**

Run: `uv run pytest tests/test_recording_service.py tests/test_recording_api.py tests/test_stage_4_flow_integration.py -q`

Expected: FAIL because the current implementation still returns the old review-only response shape.

- [ ] **Step 3: Implement the new response model**

Update `src/sayclearly/recording/models.py`:

```python
from pydantic import BaseModel, ConfigDict, Field

from sayclearly.storage.models import SessionAnalysis


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


class RecordingReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    clarity: str
    pace: str
    hesitations: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class RecordingAnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    review: RecordingReview
    analysis: SessionAnalysis
```

- [ ] **Step 4: Return `review` + persisted `analysis` from the service and API**

Update `src/sayclearly/recording/service.py` imports and normalization:

```python
from sayclearly.recording.models import (
    AudioAnalysisMetadata,
    RecordingAnalysisResult,
    RecordingReview,
    StructuredAudioAnalysis,
)
from sayclearly.storage.models import Hesitation, SessionAnalysis


    # Update the return type annotation only.
    def analyze_recording(
        self,
        audio_bytes: bytes,
        filename: str | None,
        content_type: str | None,
        metadata: AudioAnalysisMetadata,
    ) -> RecordingAnalysisResult:
        # Existing body stays in place until the normalization return is updated below.

    def _normalize_analysis(self, structured: StructuredAudioAnalysis) -> RecordingAnalysisResult:
        analysis_hesitations = [
            Hesitation.model_validate(hesitation) for hesitation in structured.hesitations
        ]
        analysis = SessionAnalysis(
            clarity_score=structured.clarity_score,
            pace_score=structured.pace_score,
            hesitations=analysis_hesitations,
            summary=structured.summary,
        )
        review = RecordingReview(
            summary=" ".join(structured.summary) if structured.summary else "Analysis complete.",
            clarity=self._score_to_text(structured.clarity_score, "clarity"),
            pace=self._score_to_text(structured.pace_score, "pace"),
            hesitations=[
                (
                    f"{hesitation.note} (at {hesitation.start:.1f}s-{hesitation.end:.1f}s)"
                    if hesitation.end >= hesitation.start
                    else hesitation.note
                )
                for hesitation in analysis_hesitations
            ],
            recommendations=structured.recommendations,
        )
        return RecordingAnalysisResult(review=review, analysis=analysis)
```

Update `src/sayclearly/recording/api.py`:

```python
from sayclearly.recording.models import AudioAnalysisMetadata, RecordingAnalysisResult


    @router.post("/api/analyze-recording", response_model=RecordingAnalysisResult)
    async def analyze_recording(
        audio: Annotated[UploadFile, File()],
        metadata: Annotated[str, Form()] = "{}",
    ) -> RecordingAnalysisResult:
```

- [ ] **Step 5: Run the targeted tests to verify they pass**

Run: `uv run pytest tests/test_recording_service.py tests/test_recording_api.py tests/test_stage_4_flow_integration.py -q`

Expected: PASS.

- [ ] **Step 6: Commit the backend response-contract slice**

```bash
git add src/sayclearly/recording/models.py src/sayclearly/recording/service.py src/sayclearly/recording/api.py tests/test_recording_service.py tests/test_recording_api.py tests/test_stage_4_flow_integration.py
git commit -m "feat: return persisted analysis with recording review"
```

---

### Task 2: Add Stage 7 Shell Markup And History Hooks

**Files:**
- Modify: `src/sayclearly/templates/index.html`
- Modify: `src/sayclearly/static/styles.css`
- Modify: `tests/test_app_shell.py`

- [ ] **Step 1: Write the failing shell test for Stage 7 hooks**

Add to `tests/test_app_shell.py`:

```python
def test_home_page_renders_stage_7_history_hooks() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "data-new-session-button" in response.text
    assert "data-review-reuse-topic-button" in response.text
    assert "data-open-history-button" in response.text
    assert 'data-screen="history"' in response.text
    assert "data-history-list" in response.text
    assert "data-history-empty-state" in response.text
    assert "data-history-error" in response.text
    assert "data-history-retry-button" in response.text
    assert "data-history-back-button" in response.text
    assert "data-history-details" in response.text
    assert "data-history-detail-summary" in response.text
    assert "data-history-detail-text" in response.text
    assert "data-history-detail-reuse-topic-button" in response.text
```

- [ ] **Step 2: Run the shell test to verify it fails**

Run: `uv run pytest tests/test_app_shell.py::test_home_page_renders_stage_7_history_hooks -q`

Expected: FAIL because the page does not render any Stage 7 review/history controls yet.

- [ ] **Step 3: Add the review action buttons and history screen markup**

Update the review button row in `src/sayclearly/templates/index.html` to:

```html
          <div class="button-row review-actions" data-review-actions>
            <button type="button" class="button button-secondary" data-new-session-button>
              New session
            </button>
            <button
              type="button"
              class="button button-secondary"
              data-review-reuse-topic-button
            >
              Reuse topic
            </button>
            <button type="button" class="button button-primary" data-open-history-button>
              Open history
            </button>
          </div>

          <div class="button-row">
            <button type="button" class="button button-secondary" data-reset-button>Reset</button>
            <button type="button" class="button button-primary" data-next-step-button>Next step</button>
          </div>
```

Add a third screen section immediately after the exercise screen:

```html
        <section class="panel screen-panel history-panel" data-screen="history" hidden>
          <div class="panel-heading history-header">
            <div>
              <p class="section-kicker">History</p>
              <h2>Recent speaking sessions</h2>
            </div>
            <button type="button" class="button button-ghost" data-history-back-button>
              Back
            </button>
          </div>

          <p class="history-feedback" data-history-save-error hidden></p>
          <p class="history-feedback" data-history-error hidden></p>

          <div class="history-empty-state" data-history-empty-state hidden>
            <p>No saved sessions yet. Complete a review to build your history.</p>
            <button type="button" class="button button-primary" data-new-session-button>
              Start a new session
            </button>
          </div>

          <div class="history-layout">
            <div class="history-list" data-history-list></div>

            <aside class="history-details" data-history-details>
              <p class="section-kicker">Session details</p>
              <p class="history-detail-summary" data-history-detail-summary>
                Select a session to inspect its review details.
              </p>
              <p class="history-detail-meta" data-history-detail-meta></p>
              <div class="history-detail-text" data-history-detail-text></div>
              <p class="history-detail-analysis" data-history-detail-clarity></p>
              <p class="history-detail-analysis" data-history-detail-pace></p>
              <p class="history-detail-analysis" data-history-detail-hesitations></p>
              <button
                type="button"
                class="button button-secondary"
                data-history-detail-reuse-topic-button
                disabled
              >
                Reuse topic
              </button>
              <button type="button" class="button button-ghost" data-history-retry-button hidden>
                Retry details
              </button>
            </aside>
          </div>
        </section>
```

- [ ] **Step 4: Add the supporting Stage 7 styles**

Append to `src/sayclearly/static/styles.css`:

```css
.review-actions {
    margin-top: 1rem;
    margin-bottom: 1rem;
}

.history-panel {
    display: grid;
    gap: 1rem;
}

.history-header,
.history-layout {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
}

.history-feedback,
.history-detail-summary,
.history-detail-meta,
.history-detail-analysis,
.history-card-copy {
    margin: 0;
    color: #52606d;
    line-height: 1.6;
}

.history-empty-state,
.history-list,
.history-details,
.history-card {
    display: grid;
    gap: 0.75rem;
}

.history-list,
.history-details {
    flex: 1 1 0;
    min-width: 0;
    padding: 1rem;
    border: 1px solid rgba(124, 92, 43, 0.16);
    border-radius: 1rem;
    background: rgba(252, 249, 243, 0.92);
}

.history-card {
    padding: 1rem;
    border: 1px solid rgba(138, 109, 59, 0.14);
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.88);
}

.history-card-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.history-detail-text {
    padding: 1rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.92);
    border: 1px dashed rgba(124, 92, 43, 0.3);
    line-height: 1.7;
    color: #334e68;
}

@media (max-width: 960px) {
    .history-header,
    .history-layout {
        flex-direction: column;
    }
}
```

- [ ] **Step 5: Run the shell test to verify it passes**

Run: `uv run pytest tests/test_app_shell.py::test_home_page_renders_stage_7_history_hooks -q`

Expected: PASS.

- [ ] **Step 6: Commit the shell and style slice**

```bash
git add src/sayclearly/templates/index.html src/sayclearly/static/styles.css tests/test_app_shell.py
git commit -m "feat: add review and history shell hooks"
```

---

### Task 3: Implement Frontend History State And Orchestration

**Files:**
- Modify: `src/sayclearly/static/app_state.ts`
- Modify: `src/sayclearly/static/app.ts`
- Modify: `src/sayclearly/static/dist/app_state.js`
- Modify: `src/sayclearly/static/dist/app.js`

- [ ] **Step 1: Add the Stage 7 frontend types and state helpers**

Update `src/sayclearly/static/app_state.ts` with the new types and state fields:

```ts
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
  | 'history'
  | 'error';

export interface Hesitation {
  start: number;
  end: number;
  note: string;
}

export interface SessionAnalysis {
  clarity_score: number;
  pace_score: number;
  hesitations: Hesitation[];
  summary: string[];
}

export interface HistorySession {
  id: string;
  created_at: string;
  language: string;
  topic_prompt: string | null;
  text: string;
  analysis: SessionAnalysis;
}

export interface HistoryStore {
  version: number;
  sessions: HistorySession[];
}

export interface RecordingAnalysisResult {
  review: RecordingReview;
  analysis: SessionAnalysis;
}

type HistoryOrigin = 'review' | 'home' | null;

export interface AppModel {
  flow: FlowState;
  config: PublicConfig;
  settings: SettingsFormState;
  generated_exercise: GeneratedExercise | null;
  has_recording: boolean;
  recording_error: string | null;
  review: RecordingReview | null;
  latest_session: HistorySession | null;
  history_sessions: HistorySession[] | null;
  selected_history_session: HistorySession | null;
  history_error: string | null;
  history_save_error: string | null;
  history_origin: HistoryOrigin;
  error_message: string | null;
}
```

Add the new helpers near the bottom of the file:

```ts
export function applyAnalysisResult(
  model: AppModel,
  result: RecordingAnalysisResult,
  session: HistorySession,
): AppModel {
  return {
    ...model,
    flow: 'review',
    has_recording: true,
    recording_error: null,
    review: result.review,
    latest_session: session,
    history_save_error: null,
  };
}

export function applyHistorySaveError(model: AppModel, message: string): AppModel {
  return {
    ...model,
    history_save_error: message,
  };
}

export function enterHistory(model: AppModel, origin: HistoryOrigin): AppModel {
  return {
    ...model,
    flow: 'history',
    history_origin: origin,
    history_error: null,
  };
}

export function applyHistoryLoaded(model: AppModel, history: HistoryStore): AppModel {
  return {
    ...model,
    history_sessions: history.sessions,
    selected_history_session: history.sessions[0] ?? null,
    history_error: null,
  };
}

export function applyHistoryDetails(model: AppModel, session: HistorySession): AppModel {
  return {
    ...model,
    selected_history_session: session,
    history_error: null,
  };
}

export function applyHistoryError(model: AppModel, message: string): AppModel {
  return {
    ...model,
    history_error: message,
  };
}

export function returnFromHistory(model: AppModel): AppModel {
  return {
    ...model,
    flow: model.history_origin === 'review' && model.review !== null ? 'review' : 'home',
    history_origin: null,
  };
}

export function startNewSession(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'home',
    generated_exercise: null,
    has_recording: false,
    recording_error: null,
    review: null,
    latest_session: null,
    selected_history_session: null,
    history_error: null,
    history_save_error: null,
    history_origin: null,
    error_message: null,
  };
}

export function reuseTopic(model: AppModel, topicPrompt: string): AppModel {
  return {
    ...startNewSession(model),
    settings: {
      ...model.settings,
      topic_prompt: topicPrompt,
      reuse_last_topic: false,
    },
  };
}
```

- [ ] **Step 2: Mirror the same state additions into the committed JS bundle**

Update `src/sayclearly/static/dist/app_state.js` with the JavaScript equivalent:

```js
export function applyAnalysisResult(model, result, session) {
  return {
    ...model,
    flow: 'review',
    has_recording: true,
    recording_error: null,
    review: result.review,
    latest_session: session,
    history_save_error: null,
  };
}

export function applyHistorySaveError(model, message) {
  return {
    ...model,
    history_save_error: message,
  };
}

export function enterHistory(model, origin) {
  return {
    ...model,
    flow: 'history',
    history_origin: origin,
    history_error: null,
  };
}

export function applyHistoryLoaded(model, history) {
  return {
    ...model,
    history_sessions: history.sessions,
    selected_history_session: history.sessions[0] ?? null,
    history_error: null,
  };
}

export function applyHistoryDetails(model, session) {
  return {
    ...model,
    selected_history_session: session,
    history_error: null,
  };
}

export function applyHistoryError(model, message) {
  return {
    ...model,
    history_error: message,
  };
}

export function returnFromHistory(model) {
  return {
    ...model,
    flow: model.history_origin === 'review' && model.review !== null ? 'review' : 'home',
    history_origin: null,
  };
}

export function startNewSession(model) {
  return {
    ...model,
    flow: 'home',
    generated_exercise: null,
    has_recording: false,
    recording_error: null,
    review: null,
    latest_session: null,
    selected_history_session: null,
    history_error: null,
    history_save_error: null,
    history_origin: null,
    error_message: null,
  };
}

export function reuseTopic(model, topicPrompt) {
  return {
    ...startNewSession(model),
    settings: {
      ...model.settings,
      topic_prompt: topicPrompt,
      reuse_last_topic: false,
    },
  };
}
```

- [ ] **Step 3: Wire history save/load/details and new buttons in `app.ts`**

Update the imports at the top of `src/sayclearly/static/app.ts`:

```ts
import {
  advanceExerciseStep,
  applyAnalysisError,
  applyAnalysisResult,
  applyGeneratedExercise,
  applyGenerationError,
  applyHistoryDetails,
  applyHistoryError,
  applyHistoryLoaded,
  applyHistorySaveError,
  applyLoadedConfig,
  applyRecordingError,
  buildConfigUpdatePayload,
  buildGenerateRequest,
  createInitialAppModel,
  enterHistory,
  markRecordingStarted,
  resetRecording,
  returnFromHistory,
  reuseTopic,
  startNewSession,
  startRecordingAnalysis,
  startRecordingRequest,
  startGeneration,
  storeRecordedAudio,
  syncAnalysisModel,
  syncAnalysisLanguage,
  type AppModel,
  type GeneratedExercise,
  type HistorySession,
  type HistoryStore,
  type PublicConfig,
  type RecordingAnalysisResult,
  type SettingsFormState,
} from './app_state.js';
```

Extend `RootLike` so the button collection type-checks:

```ts
type RootLike = ParentNode & {
  querySelector<E extends Element = Element>(selector: string): E | null;
  querySelectorAll<E extends Element = Element>(selector: string): NodeListOf<E>;
};
```

Extend `ShellElements` and `collectShellElements()` with the Stage 7 hooks:

```ts
  historyScreen: HTMLElement;
  newSessionButtons: HTMLButtonElement[];
  reviewReuseTopicButton: HTMLButtonElement;
  openHistoryButton: HTMLButtonElement;
  historyList: HTMLElement;
  historyEmptyState: HTMLElement;
  historyError: HTMLElement;
  historySaveError: HTMLElement;
  historyRetryButton: HTMLButtonElement;
  historyBackButton: HTMLButtonElement;
  historyDetails: HTMLElement;
  historyDetailSummary: HTMLElement;
  historyDetailMeta: HTMLElement;
  historyDetailText: HTMLElement;
  historyDetailClarity: HTMLElement;
  historyDetailPace: HTMLElement;
  historyDetailHesitations: HTMLElement;
  historyDetailReuseTopicButton: HTMLButtonElement;
```

In `collectShellElements(root)`, add the concrete selectors:

```ts
    historyScreen: getRequiredElement(root, '[data-screen="history"]'),
    newSessionButtons: Array.from(root.querySelectorAll('[data-new-session-button]')),
    reviewReuseTopicButton: getRequiredElement(root, '[data-review-reuse-topic-button]'),
    openHistoryButton: getRequiredElement(root, '[data-open-history-button]'),
    historyList: getRequiredElement(root, '[data-history-list]'),
    historyEmptyState: getRequiredElement(root, '[data-history-empty-state]'),
    historyError: getRequiredElement(root, '[data-history-error]'),
    historySaveError: getRequiredElement(root, '[data-history-save-error]'),
    historyRetryButton: getRequiredElement(root, '[data-history-retry-button]'),
    historyBackButton: getRequiredElement(root, '[data-history-back-button]'),
    historyDetails: getRequiredElement(root, '[data-history-details]'),
    historyDetailSummary: getRequiredElement(root, '[data-history-detail-summary]'),
    historyDetailMeta: getRequiredElement(root, '[data-history-detail-meta]'),
    historyDetailText: getRequiredElement(root, '[data-history-detail-text]'),
    historyDetailClarity: getRequiredElement(root, '[data-history-detail-clarity]'),
    historyDetailPace: getRequiredElement(root, '[data-history-detail-pace]'),
    historyDetailHesitations: getRequiredElement(root, '[data-history-detail-hesitations]'),
    historyDetailReuseTopicButton: getRequiredElement(
      root,
      '[data-history-detail-reuse-topic-button]',
    ),
```

Add the history helpers above `render()`:

```ts
function createClientSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildHistorySession(
  exercise: GeneratedExercise,
  analysis: RecordingAnalysisResult['analysis'],
): HistorySession {
  return {
    id: createClientSessionId(),
    created_at: new Date().toISOString(),
    language: exercise.language,
    topic_prompt: exercise.topic_prompt === '' ? null : exercise.topic_prompt,
    text: exercise.text,
    analysis,
  };
}

async function loadHistory(fetchImpl: typeof fetch): Promise<HistoryStore> {
  return await requestJson<HistoryStore>(fetchImpl, '/api/history', { method: 'GET' });
}

async function loadHistorySession(fetchImpl: typeof fetch, sessionId: string): Promise<HistorySession> {
  return await requestJson<HistorySession>(fetchImpl, `/api/history/${sessionId}`, { method: 'GET' });
}

async function saveHistorySession(
  fetchImpl: typeof fetch,
  session: HistorySession,
): Promise<HistoryStore> {
  return await requestJson<HistoryStore>(fetchImpl, '/api/history', {
    method: 'POST',
    body: JSON.stringify(session),
  });
}
```

Replace the analyze success block with the Stage 7 flow:

```ts
      const result = await requestJson<RecordingAnalysisResult>(fetchImpl, '/api/analyze-recording', {
        method: 'POST',
        body: formData,
      });
      const latestSession = buildHistorySession(model.generated_exercise!, result.analysis);
      model = applyAnalysisResult(model, result, latestSession);
      try {
        const history = await saveHistorySession(fetchImpl, latestSession);
        model = applyHistoryLoaded(model, history);
      } catch {
        model = applyHistorySaveError(
          model,
          'Review is ready, but this session was not saved to history.',
        );
      }
```

Add the Stage 7 button handlers before the initial config load:

```ts
  for (const button of elements.newSessionButtons) {
    button.addEventListener('click', () => {
      reuseNextGeneration = false;
      clearRecordingArtifacts();
      model = startNewSession(model);
      render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    });
  }

  elements.reviewReuseTopicButton.addEventListener('click', () => {
    const topicPrompt = model.latest_session?.topic_prompt ?? '';
    if (topicPrompt === '') {
      return;
    }
    clearRecordingArtifacts();
    model = reuseTopic(model, topicPrompt);
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
  });

  elements.openHistoryButton.addEventListener('click', async () => {
    model = enterHistory(model, model.review !== null ? 'review' : 'home');
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    try {
      const history = await loadHistory(fetchImpl);
      model = applyHistoryLoaded(model, history);
    } catch {
      model = applyHistoryError(model, 'Could not load saved history. Try again.');
    }
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
  });

  elements.historyBackButton.addEventListener('click', () => {
    model = returnFromHistory(model);
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
  });

  elements.historyRetryButton.addEventListener('click', async () => {
    const selectedId = model.selected_history_session?.id;
    if (!selectedId) {
      return;
    }
    try {
      const session = await loadHistorySession(fetchImpl, selectedId);
      model = applyHistoryDetails(model, session);
    } catch {
      model = applyHistoryError(model, 'Could not load session details. Try again.');
    }
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
  });

  elements.historyDetailReuseTopicButton.addEventListener('click', () => {
    const topicPrompt = model.selected_history_session?.topic_prompt ?? '';
    if (topicPrompt === '') {
      return;
    }
    clearRecordingArtifacts();
    model = reuseTopic(model, topicPrompt);
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
  });
```

- [ ] **Step 4: Render the history screen and session cards**

Add to `render()` in `src/sayclearly/static/app.ts`:

```ts
  elements.historyScreen.hidden = model.flow !== 'history';
  elements.setupScreen.hidden = hasExercise || model.flow === 'history';
  elements.exerciseScreen.hidden = !hasExercise || model.flow === 'history';

  elements.historySaveError.hidden = model.history_save_error === null;
  elements.historySaveError.textContent = model.history_save_error ?? '';
  elements.historyError.hidden = model.history_error === null;
  elements.historyError.textContent = model.history_error ?? '';

  const sessions = model.history_sessions ?? [];
  elements.historyEmptyState.hidden = !(model.flow === 'history' && sessions.length === 0 && model.history_error === null);

  const cards = sessions.map((session) => {
    const card = documentRef.createElement('article');
    card.className = 'history-card';

    const summary = documentRef.createElement('p');
    summary.className = 'history-card-copy';
    summary.textContent = session.analysis.summary[0] ?? 'No summary yet.';

    const meta = documentRef.createElement('p');
    meta.className = 'history-card-copy';
    meta.textContent = `${new Date(session.created_at).toLocaleString()} • ${session.language} • ${session.topic_prompt ?? 'No topic'}`;

    const detailsButton = documentRef.createElement('button');
    detailsButton.type = 'button';
    detailsButton.className = 'button button-ghost';
    detailsButton.textContent = 'Open details';
    detailsButton.addEventListener('click', async () => {
      try {
        const detailed = await loadHistorySession(fetchImpl, session.id);
        model = applyHistoryDetails(model, detailed);
      } catch {
        model = applyHistoryError(model, 'Could not load session details. Try again.');
      }
      render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    });

    const reuseButton = documentRef.createElement('button');
    reuseButton.type = 'button';
    reuseButton.className = 'button button-secondary';
    reuseButton.textContent = 'Reuse topic';
    reuseButton.disabled = !session.topic_prompt;
    reuseButton.addEventListener('click', () => {
      if (!session.topic_prompt) {
        return;
      }
      clearRecordingArtifacts();
      model = reuseTopic(model, session.topic_prompt);
      render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    });

    const actions = documentRef.createElement('div');
    actions.className = 'history-card-actions';
    actions.append(detailsButton, reuseButton);

    card.append(meta, summary, actions);
    return card;
  });
  elements.historyList.replaceChildren(...cards);

  const selected = model.selected_history_session;
  elements.historyDetailSummary.textContent = selected?.analysis.summary.join(' ') ?? 'Select a session to inspect its review details.';
  elements.historyDetailMeta.textContent = selected ? `${selected.language} • ${selected.topic_prompt ?? 'No topic'}` : '';
  elements.historyDetailText.textContent = selected?.text ?? '';
  elements.historyDetailClarity.textContent = selected ? `Clarity score: ${selected.analysis.clarity_score}` : '';
  elements.historyDetailPace.textContent = selected ? `Pace score: ${selected.analysis.pace_score}` : '';
  elements.historyDetailHesitations.textContent = selected
    ? selected.analysis.hesitations.map((h) => `${h.note} (${h.start.toFixed(1)}s-${h.end.toFixed(1)}s)`).join('\n')
    : '';
  elements.historyDetailReuseTopicButton.disabled = !selected?.topic_prompt;
  elements.historyRetryButton.hidden = model.history_error === null;
```

- [ ] **Step 5: Mirror the same logic into the committed JavaScript bundle**

Update `src/sayclearly/static/dist/app.js` with the JavaScript equivalent of the new imports, helpers, handlers, and render logic from Steps 3 and 4.

At minimum, the emitted JS must include these exact function bodies and handler registrations without TypeScript type annotations:

```js
function createClientSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildHistorySession(exercise, analysis) {
  return {
    id: createClientSessionId(),
    created_at: new Date().toISOString(),
    language: exercise.language,
    topic_prompt: exercise.topic_prompt === '' ? null : exercise.topic_prompt,
    text: exercise.text,
    analysis,
  };
}

async function loadHistory(fetchImpl) {
  return await requestJson(fetchImpl, '/api/history', { method: 'GET' });
}

async function loadHistorySession(fetchImpl, sessionId) {
  return await requestJson(fetchImpl, `/api/history/${sessionId}`, { method: 'GET' });
}

async function saveHistorySession(fetchImpl, session) {
  return await requestJson(fetchImpl, '/api/history', {
    method: 'POST',
    body: JSON.stringify(session),
  });
}
```

- [ ] **Step 6: Run the shell and backend regression tests**

Run: `uv run pytest tests/test_app_shell.py tests/test_recording_api.py tests/test_stage_4_flow_integration.py -q`

Expected: PASS.

- [ ] **Step 7: Commit the Stage 7 frontend logic slice**

```bash
git add src/sayclearly/static/app_state.ts src/sayclearly/static/app.ts src/sayclearly/static/dist/app_state.js src/sayclearly/static/dist/app.js
git commit -m "feat: add review history frontend flow"
```

---

### Task 4: Add Stage 7 Integration Coverage And Final Verification

**Files:**
- Modify: `tests/test_history_api.py`
- Create: `tests/test_stage_7_flow_integration.py`

- [ ] **Step 1: Write the failing Stage 7 regression tests**

Add to `tests/test_history_api.py`:

```python
def test_get_history_returns_empty_list_by_default(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.get("/api/history")

    assert response.status_code == 200
    assert response.json() == {"version": 1, "sessions": []}
```

Create `tests/test_stage_7_flow_integration.py`:

```python
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sayclearly.app import create_app
from sayclearly.gemini.client import GeneratedExercise
from sayclearly.recording.models import StructuredAudioAnalysis


def test_stage_7_happy_path_saves_history_and_reuses_topic(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    exercise_text = "Speak clearly about ordering coffee before work."
    monkeypatch.setattr(
        "sayclearly.exercise.service.GeminiClient.generate_exercise",
        lambda self, *, prompt, model, thinking_level: GeneratedExercise(text=exercise_text),
    )
    monkeypatch.setattr(
        "sayclearly.gemini.client.GeminiClient.analyze_audio",
        lambda self, *, audio_bytes, content_type, prompt, model, thinking_level, system_instruction=None: StructuredAudioAnalysis(
            clarity_score=72,
            pace_score=65,
            hesitations=[{"start": 1.0, "end": 2.0, "note": "pause"}],
            summary=["Good effort."],
            recommendations=["Keep practicing."],
        ),
    )

    client = TestClient(create_app(tmp_path))
    config = client.get("/api/config").json()
    client.post(
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

    exercise = client.post(
        "/api/generate-text",
        json={
            "language": "en",
            "analysis_language": "uk",
            "topic_prompt": "",
            "reuse_last_topic": True,
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
            "reuse_last_topic": False,
        },
    )

    assert saved.status_code == 200
    assert listed.status_code == 200
    assert listed.json()["sessions"][0]["id"] == "session-1"
    assert detail.status_code == 200
    assert detail.json()["analysis"]["summary"] == ["Good effort."]
    assert reused.status_code == 200
    assert reused.json()["topic_prompt"] == "Order coffee before work"
```

- [ ] **Step 2: Run the new tests as a Stage 7 regression check**

Run: `uv run pytest tests/test_history_api.py tests/test_stage_7_flow_integration.py -q`

Expected: PASS after Tasks 1-3 are complete. If this fails, treat it as a regression in the Stage 7 flow before moving to the full-suite run.

- [ ] **Step 3: Run the full verification suite**

Run: `uv run pytest`
Expected: PASS.

Run: `uv run ruff check .`
Expected: PASS.

Run: `uv run ruff format --check .`
Expected: PASS.

- [ ] **Step 4: Commit the regression and verification slice**

```bash
git add tests/test_history_api.py tests/test_stage_7_flow_integration.py
git commit -m "test: cover Stage 7 history flow"
```

---

## Self-Review Checklist

- Spec coverage:
  - combined review/history save contract: Task 1
  - review actions and history shell: Task 2
  - history flow, details, reuse topic, save/list/detail errors: Task 3
  - empty history and integration verification: Task 4
- Placeholder scan:
  - no TBD/TODO markers remain
  - each code-changing step includes concrete code
  - every verification step includes an exact command
- Type consistency:
  - Python uses `RecordingAnalysisResult`, `RecordingReview`, and `SessionAnalysis`
  - TypeScript uses `RecordingAnalysisResult`, `HistorySession`, and `HistoryStore`
  - history persistence always reuses the backend `analysis` payload directly instead of rebuilding it from display strings
