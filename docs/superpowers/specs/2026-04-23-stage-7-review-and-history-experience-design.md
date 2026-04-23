# Stage 7 Review and History Experience Design

## Summary

Stage 7 turns the current single-run review flow into a usable personal practice tool. After a recording is analyzed, the frontend saves the completed session into local history, the user can browse recent sessions from the same single-page shell, open a past session's details, and reuse a topic from either the current review or a previous history entry.

The existing domain boundaries stay intact: `recording/` continues to own audio analysis, `history/` continues to own persisted session storage, and the frontend state machine grows to cover history browsing without introducing new HTML routes or separate pages.

## Goals

- Save each successfully analyzed session into local history.
- Keep the current single-page shell and add history within the existing frontend state machine.
- Show a recent-session list with useful at-a-glance summary information.
- Allow opening a past session's details from the history screen.
- Allow reusing a topic from the current review or a previous session.
- Keep review visible even if history persistence fails after a successful analysis.
- Add focused backend, frontend, and integration tests for the new flow.

## Out Of Scope

Stage 7 does not include:

- Cloud sync, accounts, or multi-user history.
- Editing or deleting history sessions.
- Search, filters, tags, or progress analytics.
- A new standalone history page or separate server-rendered routes.
- Long-term audio retention or playback for old sessions.
- Reworking the existing setup, exercise, or recording interaction model beyond what is needed to connect review to history.

## Current Baseline

The repository already has:

- persisted history storage in `history.json` via `HistoryService` and `HistoryStore`;
- list and detail history endpoints:
  - `GET /api/history`
  - `GET /api/history/{session_id}`
  - `POST /api/history`
- a review screen that displays analysis feedback after `POST /api/analyze-recording`;
- `last_topic_prompt` support in config and text generation.

What is still missing is the connection between the review result and persisted history, plus the UI needed to browse and reuse prior sessions.

## User Flow Boundary

Stage 7 covers this path:

1. The user generates an exercise and completes the recording flow.
2. The user uploads the recording for analysis.
3. The backend returns the review payload plus normalized analysis data suitable for history storage.
4. The frontend shows the review and immediately saves the completed session to `/api/history`.
5. The user can:
   - start a new session;
   - reuse the current topic;
   - open history.
6. In history, the user can:
   - view recent sessions;
   - open session details;
   - reuse a previous topic;
   - return to the current review when applicable.

## Architecture

### Frontend Shape

The app remains a single server-rendered page backed by the existing TypeScript state machine.

The frontend adds:

- a `history` flow state;
- a history list held in client state;
- a selected history session held in client state for the details panel;
- history loading and history detail request helpers;
- review actions for `New session`, `Reuse topic`, and `Open history`.

The app does not introduce a separate top-level `history_details` state. Instead, the history screen contains:

- a recent sessions list;
- a details area that updates when the user selects a session.

This keeps the state model minimal while still satisfying the requirement to open session details.

### Backend Shape

The backend continues using the current domain boundaries:

- `recording/` remains responsible for audio analysis and review response normalization;
- `history/` remains responsible for persisting and retrieving completed sessions;
- `storage/` keeps the persisted `HistorySession` and `SessionAnalysis` models.

Stage 7 adds a small amount of glue so the frontend can save a just-analyzed session without reverse-engineering the display-only review strings back into structured analysis.

## Request And Response Contract

### `POST /api/analyze-recording`

The endpoint continues to accept the existing multipart request:

- `audio`
- `metadata`

The response should expand from a review-only display shape to a combined review + normalized analysis shape.

Recommended response shape:

```json
{
  "review": {
    "summary": "The pace noticeably increased near the end.",
    "clarity": "The clarity is decent, with room for improvement.",
    "pace": "The pace needs some attention.",
    "hesitations": ["short restart (at 12.4s-13.1s)"],
    "recommendations": [
      "If you slow down a little, the speech will become clearer."
    ]
  },
  "analysis": {
    "clarity_score": 72,
    "pace_score": 55,
    "hesitations": [
      {
        "start": 12.4,
        "end": 13.1,
        "note": "short restart"
      }
    ],
    "summary": [
      "Tempo increased near the end",
      "Some phrase endings became less clear"
    ]
  }
}
```

Notes:

- `review` stays optimized for the current review UI.
- `analysis` stays optimized for persistence in `HistorySession.analysis`.
- `recommendations` remain review-only in Stage 7 and are not added to the persisted history schema.

### `POST /api/history`

The frontend builds and saves a completed session with the existing payload shape:

```json
{
  "id": "4c11d57e-fd58-4d14-991f-9d7784f4a3c6",
  "created_at": "2026-04-23T10:12:33Z",
  "language": "uk",
  "topic_prompt": "interesting facts about astronomy",
  "text": "Generated exercise text...",
  "analysis": {
    "clarity_score": 72,
    "pace_score": 55,
    "hesitations": [
      {
        "start": 12.4,
        "end": 13.1,
        "note": "short restart"
      }
    ],
    "summary": [
      "Tempo increased near the end",
      "Some phrase endings became less clear"
    ]
  }
}
```

### `GET /api/history`

The backend contract does not change. The frontend reads the current `HistoryStore` and derives the compact card presentation client-side.

### `GET /api/history/{session_id}`

The backend contract does not change. The frontend requests one full session when the user opens details from the history list.

This keeps the history list load simple while supporting an explicit details action.

## Frontend State Model

### Flow States

The existing `FlowState` gains:

- `history`

No separate top-level details flow is added.

### Additional Client State

The frontend model should add fields for:

- `history_sessions`: recent history list or `null` before first load;
- `selected_history_session`: detailed session payload or `null`;
- `history_error`: list/details loading error message or `null`;
- `history_save_error`: post-analysis save failure message or `null`;
- `history_origin`: whether the user opened history from `review` or from a setup/home context.

These fields let the app keep history behavior local to the history feature without overloading the generic `error_message` field.

## Screen Behavior

### Review Screen

The review screen keeps the current feedback panel and adds three actions:

- `New session`
- `Reuse topic`
- `Open history`

Behavior:

- `New session`
  - clears the current generated exercise, review, and recording artifacts;
  - returns the app to the setup screen;
  - leaves persisted config intact.
- `Reuse topic`
  - reads the current session's `topic_prompt`;
  - returns to setup;
  - pre-fills the topic input;
  - does not auto-generate a new exercise.
- `Open history`
  - switches to the `history` flow;
  - loads the recent history list.

### History Screen

The history screen lives in the same shell and shows:

- a list of recent sessions;
- a details panel for the selected session;
- a back action;
- an empty state when no sessions exist.

Each history card shows:

- date/time;
- language;
- topic or `No topic` when absent;
- a short summary line derived from `analysis.summary`.

Each history card supports:

- `Open details`
- `Reuse topic`

### History Details Panel

The details area shows:

- generated exercise text;
- summary bullets;
- clarity summary derived from `clarity_score`;
- pace summary derived from `pace_score`;
- hesitation notes;
- a topic reuse action.

The details panel should reuse the same calm review tone as the current review screen.

## Topic Reuse Rules

Topic reuse is intentionally simple:

- If a session has a non-empty `topic_prompt`, the user can reuse it.
- Reusing a topic from review or history returns to setup and places the topic in the topic input.
- The app does not auto-submit generation.
- If a session has no topic, the `Reuse topic` action is disabled.

This keeps the behavior explicit and avoids surprising automatic transitions.

## Analysis-To-History Mapping

After a successful analysis response, the frontend builds a `HistorySession` from:

- a client-generated UUID;
- the current timestamp in ISO 8601 form;
- the active generated exercise fields:
  - `language`
  - `topic_prompt`
  - `text`
- the normalized `analysis` payload returned from `/api/analyze-recording`.

This is the minimal change that keeps history persistence inside the existing `history` API rather than coupling `recording/` directly to storage writes.

## Error Handling

### Analysis Succeeds But History Save Fails

- The review still opens.
- The app stores a non-blocking message such as:
  - `Review is ready, but this session was not saved to history.`
- The user can continue using `New session`, `Reuse topic`, or `Open history`.

This is the key Stage 7 partial-failure rule: history persistence should not erase a successful review.

### History List Load Fails

- The history screen remains open.
- The list area shows a short error message and a retry action.
- The current review session, if any, is left untouched.

### History Details Load Fails

- The list stays visible.
- The details panel shows a local error state.
- The user can select another session or retry.

### Empty History

- Show an empty state with a short calm message.
- Provide an action to return to setup and start a new session.

### Session Without Topic

- Show `No topic` in the list.
- Disable `Reuse topic` for that session.

## Module Boundaries

### `src/sayclearly/recording/models.py`

Responsibilities:

- keep the display-oriented review model;
- add or expose the normalized analysis payload needed by Stage 7;
- define the expanded analysis response contract.

### `src/sayclearly/recording/service.py`

Responsibilities:

- keep analysis logic as-is;
- return both review text and normalized analysis data;
- avoid writing history directly.

### `src/sayclearly/history/service.py`

Responsibilities remain unchanged:

- save a completed `HistorySession`;
- list recent sessions newest-first;
- return one stored session by id.

No Stage 7 schema change is required for `HistorySession` or `HistoryStore`.

### `src/sayclearly/static/app_state.ts`

Responsibilities:

- add the `history` flow and history-related client state;
- add state transition helpers for entering history, loading history, selecting a session, and reusing a topic.

### `src/sayclearly/static/app.ts`

Responsibilities:

- save the analyzed session to `/api/history` after analysis succeeds;
- load `/api/history` on demand when history is opened;
- load `/api/history/{id}` for the details panel;
- render the history list, details panel, empty state, and local history errors;
- keep the current review flow working if history requests fail.

### `src/sayclearly/templates/index.html`

Responsibilities:

- add the review action buttons;
- add the history screen structure inside the existing page shell;
- add placeholders for list, details, empty state, and retry/back actions.

### `src/sayclearly/static/styles.css`

Responsibilities:

- style the history list and details area in the same calm visual language as the current app;
- keep desktop and mobile layouts usable without introducing a separate responsive system.

## Testing Strategy

### Backend Tests

- Extend recording API/service tests to cover the expanded analysis response shape.
- Keep history API/service tests and add focused cases for:
  - empty history list;
  - missing session detail;
  - stable newest-first ordering after Stage 7 usage.

### Frontend Tests

- Add state transition tests for:
  - review to history;
  - history back to review;
  - new session from review;
  - topic reuse from review;
  - topic reuse from a history entry;
  - disabled topic reuse when `topic_prompt` is empty.
- Add app-flow tests for:
  - successful analysis followed by successful history save;
  - successful analysis followed by failed history save;
  - failed history list load;
  - failed history detail load.

### Integration Test

Add one end-to-end integration flow covering:

1. generate exercise;
2. analyze recording;
3. auto-save completed session into history;
4. open history;
5. open session details;
6. reuse topic and return to setup.

## Verification Criteria

Stage 7 is complete when:

- completing analysis saves a session into local history;
- the history screen shows recent sessions with useful summary information;
- a user can reopen a previous session;
- a user can reuse a previous topic;
- review remains available even if history save fails;
- the new tests pass alongside the existing suite.
