# SayClearly MVP Implementation Stages

This document breaks the MVP into implementation stages.

Each stage is intentionally larger than a micro-task and smaller than a long free-form stream of work. The goal is that every stage ends with a concrete, testable outcome that can be reviewed before planning the next one in detail.

## Stage 1. Local Runtime Skeleton

Create the runnable application shell: Python package layout, CLI entry point, FastAPI app, template/static wiring, fixed localhost startup, browser opening, and a simple health check.

At the end of this stage, the project should launch locally with one command and show a real web page instead of a placeholder script.

How to verify:

- `uv run sayclearly` starts the local server.
- The browser opens the app automatically.
- `GET /api/health` returns a successful response.

## Stage 2. Local Data and Storage Foundation

Add the local data layer under `~/.sayclearly/`: configuration loading/saving, history loading/saving, cache directory management, defaults, versioned JSON structures, atomic writes, and the distinction between session-only and remembered API key storage.

At the end of this stage, the app should have a reliable local persistence foundation without depending on Gemini or the full UI flow.

How to verify:

- The application creates the expected local folder structure on first run.
- Config changes persist across restarts when persistence is enabled.
- History storage enforces the session limit and writes files atomically.

## Stage 3. Guided Exercise Flow UI

Build the core product flow in the browser with server-rendered HTML and plain TypeScript: home/setup screen, language controls, topic input, "use same language" behavior, generated exercise display, and the three guided exercise steps driven by a simple state machine.

Use a temporary stub for generated exercise text so the flow can be exercised before AI integration.

At the end of this stage, a user should be able to move through the main non-recording flow from setup to retelling readiness.

How to verify:

- The setup screen captures the required inputs.
- The UI transitions through the expected exercise states in the right order.
- A user can generate a placeholder exercise and reach the retelling step without manual page editing or developer tools.

## Stage 4. Recording and Upload Flow

Implement microphone access and the final retelling loop in the browser: record, stop, playback, re-record, and upload the audio to the backend. Add temporary audio file handling on the backend and wire the UI to error states for microphone denial, empty recording, and failed upload.

Use a temporary stub for the analysis response so the full recording loop works before Gemini analysis is added.

At the end of this stage, the product should already support a real recorded session, even if the feedback is still mocked.

How to verify:

- The browser requests microphone permission and records audio.
- The user can play back and re-record before analysis.
- The backend receives the audio and stores it only as temporary data for the current flow.

## Stage 5. Exercise Text Generation with Gemini

Replace the placeholder exercise generator with real Gemini-backed text generation. Include prompt design, structured response parsing, recent-text awareness, topic handling, and language-specific generation.

At the end of this stage, the user should receive useful fresh exercise texts from the real model through the actual UI.

How to verify:

- Generating an exercise from the UI returns a real 5-8 sentence text.
- The result reflects the chosen language and optional topic.
- The backend normalizes the model response into the expected application format.

## Stage 6. Audio Analysis with Gemini

Replace the stub analysis with real Gemini-backed audio analysis. Add upload-to-model integration, structured JSON normalization, feedback shaping, and optional Langfuse instrumentation when the required environment variables are present.

At the end of this stage, the app should return compact, practical feedback from a real recorded retelling.

How to verify:

- A recorded retelling can be sent from the UI and analyzed successfully.
- The review payload contains normalized fields for clarity, pace, hesitations, summary, and recommendations.
- Friendly error handling works for missing key, invalid key, and Gemini-side failures.

## Stage 7. Review and History Experience

Connect completed sessions to persistent history and the review UI. This includes saving analyzed sessions, listing recent sessions, opening session details, showing short summaries, and allowing topic reuse from previous work.

At the end of this stage, the product should feel like a usable personal tool rather than a single-run demo.

How to verify:

- Completing analysis saves a session into local history.
- The history screen shows recent sessions with useful summary information.
- A user can reopen a previous session and reuse a previous topic.

## Stage 8. MVP Hardening and Distribution

Finish the MVP around reliability and delivery: privacy and BYOK messaging, configuration and error polish, cleanup rules for temporary audio, packaging for the intended `uvx` launch path, and smoke/integration coverage for the core flows.

At the end of this stage, the repository should be ready for practical local use as the MVP described in the specification.

How to verify:

- The app can be launched through the intended local command path.
- Core smoke tests pass for startup, storage, and main API flows.
- The UI clearly communicates local storage, Gemini usage, and optional telemetry behavior.
