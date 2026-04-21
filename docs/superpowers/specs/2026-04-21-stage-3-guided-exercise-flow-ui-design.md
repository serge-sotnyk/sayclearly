# Stage 3 Guided Exercise Flow UI Design

## Summary

Stage 3 adds the first real product flow in the browser: setup, placeholder exercise generation, and the guided three-step reading flow up to retelling readiness.
The goal is to let a user move from local configuration to a generated exercise without touching developer tools, while keeping recording, review, and history browsing out of scope for this stage.

This stage keeps the current server-rendered FastAPI shell and adds a plain TypeScript client state machine inside that shell. The backend adds a stub exercise-generation API so the flow is fully usable before Gemini integration arrives in Stage 5.

## Goals

- replace the Stage 1 placeholder page with the first usable browser flow;
- let the user enter and persist an API key and basic session settings from the setup screen;
- support independent text and analysis language controls with a `use same language` behavior;
- allow optional topic input plus quick reuse of the last topic from stored config;
- generate placeholder exercise text through a backend API and display it in the UI;
- guide the user through `step_1_slow`, `step_2_natural`, and `step_3_retell_ready` with a simple client state machine;
- preserve a clean boundary so Stage 4 can extend the flow into recording rather than reworking it.

## Out Of Scope

Stage 3 does not include:

- microphone recording, upload, playback, or analysis submission;
- review or history screens;
- Gemini-backed exercise generation;
- topic reuse from persisted session history;
- long-lived frontend routing or a multi-page SPA architecture;
- strict validation that blocks placeholder generation when no API key is stored.

## Design Principles

- Keep the browser flow in one server-rendered shell page.
- Use plain TypeScript state transitions that match the MVP state model instead of building page-to-page navigation.
- Keep backend route handlers thin and move placeholder generation rules into a focused `exercise` domain package.
- Reuse Stage 2 config persistence rather than inventing separate frontend-only state.
- Keep the Stage 3 boundary narrow enough that Stage 4 can add recording behavior on top of the existing flow.
- Prefer calm, low-friction UI behavior over strict gating while Gemini is still stubbed.

## User Flow Boundary

Stage 3 should cover this end-to-end path:

1. Load `GET /` and fetch current effective config.
2. Show the setup form with API key entry, language controls, topic input, and settings access.
3. Save current setup values.
4. Generate a placeholder exercise text.
5. Move through the guided steps in order:
   - `step_1_slow`
   - `step_2_natural`
   - `step_3_retell_ready`
6. Stop at retelling readiness, where Stage 4 will later attach recording.

This stage intentionally stops before `recording`, `recorded`, `analyzing`, `review`, and `history`.

## UI Structure

The page remains a single HTML document returned by `GET /`, but the body changes from a static landing card into an application shell with two main UI sections.

### Setup section

Responsibility: collect and persist the inputs needed to start an exercise.

The setup UI should contain:

- API key input with stored-key status messaging;
- text language control;
- analysis language control;
- `use same language for analysis` toggle;
- optional topic input;
- `reuse last topic` action;
- `generate exercise` action;
- `settings` action.

The setup screen is the default state when no exercise has been generated yet.

### Exercise section

Responsibility: display the generated text and guide the user through the non-recording steps.

The exercise UI should contain:

- the generated text;
- a compact step indicator;
- the current step title;
- the current step instruction;
- a primary action for the next transition;
- a way to return to setup and generate a different text.

The generated text remains visible through all three guided steps so the user does not need to switch context while practicing.

### Settings panel

Responsibility: expose the narrow settings scope needed by Stage 3 without introducing a separate full page.

For this stage, settings can be implemented as an inline panel, drawer, or modal anchored inside the same page shell. It should include:

- saved API key presence/status;
- clear stored API key action;
- any language defaults already backed by config.

This keeps the UI simple while still satisfying the requirement that settings expose stored API key management and language settings.

## State Model

The frontend should implement a small typed state machine in TypeScript that mirrors the relevant subset of the MVP state model.

Stage 3 states:

- `home`
- `generating_text`
- `step_1_slow`
- `step_2_natural`
- `step_3_retell_ready`
- `error`

Required transitions:

- `home -> generating_text`
- `generating_text -> step_1_slow`
- `step_1_slow -> step_2_natural`
- `step_2_natural -> step_3_retell_ready`
- any active state -> `error` when an API call fails in a user-visible way;
- `error -> home` or previous safe state after the user retries or dismisses the error.

Rules:

- the UI should not allow skipping directly from `home` to `step_2_natural` or `step_3_retell_ready`;
- the UI should not introduce recording-related states yet;
- step transitions are client-side and do not require backend calls after text generation succeeds.

## Frontend Composition

### HTML shell

`src/sayclearly/templates/index.html` should become the application shell markup rather than a placeholder landing page.

The initial HTML should provide stable containers for:

- config and setup form controls;
- exercise text and step content;
- settings panel;
- inline loading and error messaging;
- a root element that TypeScript can target for state-driven updates.

### Styling

`src/sayclearly/static/styles.css` should grow from the current landing-page styling into a responsive application layout.

Design direction:

- calm, simple, low-contrast surfaces;
- readable text blocks for 5-8 sentence exercises;
- clear separation between setup and exercise areas;
- mobile-safe stacking rather than assuming desktop width.

### TypeScript module

Stage 3 should introduce the first frontend TypeScript entrypoint under `src/sayclearly/static/`.

Responsibility:

- load initial config from the backend;
- read and write form values;
- keep the language controls synchronized when `use same language` is enabled;
- call config and exercise APIs;
- own the in-memory state machine;
- update visible sections and action labels based on current state;
- render friendly loading and error states.

The TypeScript should stay focused in one small module unless the file becomes obviously hard to follow.

## Backend Module Boundaries

Stage 3 should add an `exercise/` domain package that matches the repo's domain-oriented structure.

### `src/sayclearly/exercise/models.py`

Responsibility: request and response models for placeholder exercise generation.

The request model should include:

- `language`;
- `analysis_language`;
- `topic_prompt`;
- `reuse_last_topic`.

The response model should include:

- generated `text`;
- effective `language`;
- effective `analysis_language`;
- effective `topic_prompt`.

### `src/sayclearly/exercise/service.py`

Responsibility: placeholder exercise generation rules.

This service should:

- load current config when needed;
- resolve the effective topic when `reuse_last_topic` is requested;
- generate a deterministic, clearly stubbed 5-8 sentence exercise suitable for reading aloud;
- return normalized data shaped exactly like the later real generation flow will expect.

The placeholder text should be useful for manual testing, but it must remain local and non-AI.

### `src/sayclearly/exercise/api.py`

Responsibility: HTTP transport for `POST /api/generate-text`.

The route should validate input, call the exercise service, translate storage errors into HTTP responses, and return the typed placeholder response.

### `src/sayclearly/app.py`

Responsibility: wire the new exercise router and include the frontend script in the main page.

`app.py` should remain the composition root only.

## Config And Generation Data Flow

Stage 3 should use this browser-to-backend flow:

1. On page load, frontend requests `GET /api/config`.
2. Frontend hydrates the setup controls from the returned effective config.
3. When the user generates an exercise, frontend first persists current setup values through `POST /api/config`.
4. Frontend then calls `POST /api/generate-text` using the current setup values plus `reuse_last_topic` intent.
5. Backend returns placeholder text and effective values.
6. Frontend stores the returned exercise payload in memory and transitions into `step_1_slow`.

This keeps `config.json` as the source of persisted defaults while keeping the generated text ephemeral until later stages need stronger session models.

## Topic Reuse Rules

Stage 3 supports only lightweight topic reuse.

Rules:

- if the user types a topic, that topic is used and also persisted as `last_topic_prompt`;
- if the user leaves topic empty and selects `reuse last topic`, the backend should use `config.last_topic_prompt`;
- if the user asks to reuse the last topic but no previous topic exists, generation should fall back to an empty topic rather than fail;
- Stage 3 does not read topic suggestions from history sessions.

## Language Control Rules

The UI must support two independent language values with a convenience synchronization mode.

Rules:

- `text_language` and `analysis_language` are separate persisted config values;
- when `same_language_for_analysis` is enabled, changing `text_language` immediately updates the visible analysis language value;
- when `same_language_for_analysis` is disabled, the user may edit the analysis language independently;
- the backend should receive both values explicitly in generation requests even when they currently match.

## API Contract

### `POST /api/generate-text`

Request:

```json
{
  "language": "uk",
  "analysis_language": "en",
  "topic_prompt": "interesting facts about astronomy",
  "reuse_last_topic": false
}
```

Response:

```json
{
  "text": "Placeholder exercise text...",
  "language": "uk",
  "analysis_language": "en",
  "topic_prompt": "interesting facts about astronomy"
}
```

Behavior rules:

- the response should always return the effective topic actually used;
- the returned text should contain 5-8 readable sentences;
- the route should remain provider-agnostic so Stage 5 can replace the stub generator without breaking the client contract.

## Error Handling

Stage 3 should keep errors calm and actionable.

User-visible cases:

- failed config load on startup;
- failed config save before generation;
- failed placeholder generation;
- failed API key clear action in settings.

UI behavior:

- show one inline status area for loading and error messages;
- keep wording practical and non-alarming;
- allow the user to retry without reloading the page where possible.

Because Gemini is not used yet, missing API key should be shown as a status, not as a hard blocker for placeholder generation.

## Testing Strategy

Stage 3 should add focused tests across both backend and frontend behavior.

### Backend tests

- service tests for topic resolution and placeholder text shape;
- API tests for `POST /api/generate-text` success and invalid payload handling;
- integration coverage that `create_app()` wires the new route and still renders the main page.

### Frontend tests

- state-machine transition tests for the guided steps;
- tests for `use same language` synchronization behavior;
- tests that successful generation moves the UI into `step_1_slow`;
- tests that generation failure reaches a visible error state.

If the repo adopts a lightweight JS test runner for this stage, keep it minimal and limited to the frontend logic that is easiest to regress.

## Completion Criteria

Stage 3 is complete when:

- `GET /` shows a usable setup UI instead of the Stage 1 placeholder card;
- setup values can be loaded from and saved to config storage;
- the browser can generate placeholder exercise text through `POST /api/generate-text`;
- the UI transitions from setup through `step_1_slow`, `step_2_natural`, and `step_3_retell_ready` in order;
- the flow works without manual page editing or browser developer tools;
- the implementation still leaves a clean extension point for Stage 4 recording behavior.
