# Stage 8 MVP Hardening and Distribution Design

## Summary

Stage 8 finishes the SayClearly MVP around reliability, privacy messaging, and practical local delivery. The goal is to make the existing app feel ready for real single-user local use through the intended `uvx --from git+https://github.com/serge-sotnyk/sayclearly sayclearly` launch path, while preserving the current product flow and domain boundaries.

The phase does not add a new user capability. Instead, it tightens release edges that are still visible after Stage 7: packaging and launch readiness, clearer local/BYOK/telemetry messaging in the UI, deterministic cleanup of temporary audio files after every analysis attempt, and stronger smoke and integration coverage for the main local workflow.

## Goals

- Keep the current MVP architecture and guided exercise flow intact while hardening the final release surface.
- Make the repository clearly ready for the intended `uvx --from git+... sayclearly` GitHub launch path.
- Clarify in the UI that the app runs locally, the Gemini API key is BYOK, locally stored keys stay on this machine, and Langfuse is optional.
- Change temporary audio handling to delete uploaded recordings after each analysis attempt completes.
- Preserve Stage 7 behavior where review remains visible even if history persistence fails.
- Add focused startup, packaging, cleanup, and core-flow regression coverage.
- Polish README and related developer-facing guidance only where it directly improves local MVP readiness.

## Out Of Scope

Stage 8 does not include:

- New product capabilities or new flow states.
- A desktop installer, standalone packaged binary, or hosted deployment path.
- Multi-user support, accounts, cloud sync, or shared key storage.
- Long-term audio retention, audio playback history, or an audio archive.
- A broad refactor of frontend state, config storage, or Gemini integration.
- Reworking earlier stages beyond the smallest changes required to satisfy release hardening.

## Current Baseline

The repository already has:

- a local FastAPI + Jinja2 + TypeScript app started from `sayclearly.main:main`;
- a browser-open-on-start local runtime at `127.0.0.1:8008`;
- persisted local config, secrets, and history under `~/.sayclearly/`;
- Gemini-backed exercise generation and recording analysis;
- optional Langfuse runtime instrumentation when environment variables are present;
- a single-page shell that already exposes API key status and the main guided speaking flow;
- integration coverage for earlier stage flows and history persistence.

What remains unfinished for the MVP is the final release polish around delivery assumptions, privacy messaging, temporary-file lifecycle rules, and broader confidence checks across the end-to-end local flow.

## Release Boundary

Stage 8 covers this finish-line path:

1. A user can launch the app through the intended local command path.
2. The local shell explains the key trust boundaries of the MVP:
   - the app runs locally;
   - the Gemini key is user-provided;
   - stored secrets remain on this machine;
   - telemetry is optional;
   - recordings are temporary and are not retained after analysis attempts complete.
3. The main generate -> speak -> record -> analyze -> review -> history workflow still works.
4. Temporary uploaded audio is removed after every analysis attempt, including failed attempts.
5. The repository has enough automated coverage to catch regressions in startup, storage, cleanup, and main API flow behavior.

## Architecture

### Frontend Shape

The app remains a single server-rendered page backed by the existing TypeScript state model and current screen structure. Stage 8 should not introduce new pages, separate routes, or a new settings workflow.

Frontend changes stay narrow:

- update trust-oriented copy in `src/sayclearly/templates/index.html`;
- use existing public config data in `src/sayclearly/static/app.ts` to render clearer API-key-source and optional-telemetry messaging;
- preserve the existing setup, exercise, review, and history flow behavior.

This keeps Stage 8 focused on clarity and release polish rather than product expansion.

### Backend Shape

The backend keeps the same domain boundaries:

- `config/` owns effective public config and local secret-status reporting;
- `recording/` owns upload handling, Gemini analysis, and temporary audio lifecycle;
- `history/` owns persisted session storage;
- `storage/` owns filesystem layout and JSON persistence helpers.

Stage 8 should avoid moving responsibilities across these boundaries. The main backend behavior change belongs in `recording/`: temporary audio becomes strictly request-scoped and is deleted when the analysis attempt finishes.

## Distribution Readiness

### Launch Target

The design optimizes for the real remote launch path described in the MVP spec:

```bash
uvx --from git+https://github.com/serge-sotnyk/sayclearly sayclearly
```

### Practical Requirements

Stage 8 should make the repository and docs clearly satisfy these assumptions:

- `pyproject.toml` exposes the `sayclearly` script entry point;
- the package installs with the dependencies required for local runtime;
- the frontend bundle needed by the app is available when launched from an installed repository snapshot;
- the README explains the supported launch path and local-development path without contradicting the MVP distribution model.

### Verification Boundary

Automated tests should verify the parts of packaging that can be checked inside the repository, such as entrypoint and runtime assumptions. Actual end-to-end validation of the remote GitHub `uvx` path may remain a manual release verification step if that exact remote flow is not practical to execute in the automated test environment.

## UX Messaging

Stage 8 should polish the current shell copy so the app is explicit about its trust boundaries without becoming noisy.

The setup and settings areas should communicate:

- the app is local-only for MVP use;
- the Gemini API key is BYOK;
- a key can come from environment variables or local stored secrets;
- locally stored keys remain on this machine;
- Langfuse is optional and should not appear mandatory when absent;
- recordings are temporary and are cleaned up after analysis attempts finish.

The copy should stay calm and factual, matching the existing non-harsh product tone.

Stage 8 should avoid overclaiming privacy. The UI must not imply that audio never leaves the machine, because sending the recording to Gemini for analysis is part of the intended MVP behavior.

## Temporary Audio Lifecycle

### Required Rule

Temporary uploaded audio is stored only to support the active analysis request and is deleted after the request finishes.

This rule applies to:

- successful analysis;
- missing-key configuration failure;
- invalid Gemini credentials;
- malformed Gemini response;
- provider-side failure;
- other analysis exceptions after the file has been written.

### Storage Behavior

The existing temporary directory under `~/.sayclearly/cache/temporary-recordings/` can remain the write location, but files inside it should no longer behave like a rolling cache. Stage 8 should treat this directory as a scratch space for in-flight work only.

If cleanup itself fails, the backend should swallow that cleanup error rather than replacing the primary analysis outcome with a new user-visible failure. The user-facing result should still reflect the real analysis success or failure.

## Error Handling

### Startup

If local startup fails, the command should fail clearly in the terminal with actionable information. Stage 8 should not rely on vague logs for packaging or launch problems.

### Config And Key State

The UI should clearly distinguish:

- no Gemini key available;
- Gemini key available from environment variables;
- Gemini key stored locally.

This messaging should be consistent between the setup hint text and the settings panel status text.

### Optional Telemetry

Langfuse is optional. If telemetry is not configured, the app should remain fully usable and the UI should treat telemetry as inactive, not broken. If configured incompletely, the user should still be able to complete the main local flow.

### Review And History Continuity

Stage 7's partial-failure rule remains unchanged: a successful review must remain visible even if saving that session to history fails afterward. Stage 8 work must preserve this behavior.

## Expected File Touches

The design currently expects Stage 8 to stay mostly within these files:

- `pyproject.toml`
- `README.md`
- `src/sayclearly/main.py`
- `src/sayclearly/templates/index.html`
- `src/sayclearly/static/app.ts`
- `src/sayclearly/recording/service.py`
- focused tests under `tests/`

Additional file changes are acceptable only if they directly support the Stage 8 goals above.

## Testing And Verification

### Automated Coverage

Stage 8 should add or extend tests in four areas:

- startup and shell smoke:
  - app creation;
  - home page rendering;
  - static asset serving;
  - startup/browser-open behavior where already covered;
- distribution-readiness checks:
  - package metadata and entrypoint assumptions;
  - frontend-bundle assumptions needed for installed runtime;
- recording cleanup regression coverage:
  - temporary audio deleted after successful analysis;
  - temporary audio deleted after failed analysis attempts;
- core flow integration coverage:
  - config availability;
  - exercise generation;
  - recording analysis;
  - history persistence/list/detail behavior.

The tests should stay focused and high-value. Stage 8 is not a mandate to add exhaustive UI snapshot coverage or broad new test scaffolding.

### Manual Verification

The phase should be considered done only after these checks pass:

1. Run the local quality commands:
   - `npm run test:frontend`
   - `uv run pytest`
   - `uv run ruff check .`
   - `uv run ruff format --check .`
2. Launch the app through the intended local command path used for MVP validation.
3. Confirm the browser opens and the main flow still works.
4. Confirm the UI clearly explains local storage, Gemini usage, and optional telemetry behavior.
5. Confirm temporary audio is not retained after an analysis attempt completes.

## Success Criteria

Stage 8 is successful when:

- the repo is practically ready for the intended `uvx` launch path;
- the app communicates the local/BYOK/optional-telemetry model clearly;
- temporary audio cleanup is deterministic after every analysis attempt;
- the main product loop still works without regression;
- the final automated and manual verification surface supports confident local MVP use.
