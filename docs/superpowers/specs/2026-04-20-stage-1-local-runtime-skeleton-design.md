# Stage 1 Local Runtime Skeleton Design

## Summary

Stage 1 replaces the current placeholder CLI with a real local web application shell.
The result is a runnable FastAPI application that starts from `uv run sayclearly`, opens a browser to a fixed localhost URL, serves a real HTML page, exposes static assets, and provides a simple health endpoint.

This stage intentionally stays narrow. It creates the runtime shell and the correct file layout for later stages without introducing speculative models, storage abstractions, Gemini integration, or UI state logic.

## Goals

- start the application locally with one command;
- serve a real HTML page from FastAPI instead of printing a placeholder message;
- expose `GET /api/health` for smoke and health verification;
- mount static assets and Jinja2 templates in their long-term locations;
- keep the implementation small enough that later stages can extend it without first undoing Stage 1 decisions.

## Out Of Scope

Stage 1 does not include:

- config storage or API key persistence;
- history storage;
- Gemini text generation or audio analysis;
- TypeScript application state machine;
- microphone recording flow;
- speculative domain models or mostly empty service modules;
- dynamic port selection, port fallback, or runtime configuration for host and port.

## Design Principles

- Keep only the runtime pieces needed for Stage 1.
- Put files in their long-term locations now when those locations are already clear.
- Avoid defining data models before later stages have refined the required fields.
- Keep the app local-only by binding to `127.0.0.1`.
- Make browser opening best-effort so a browser failure does not prevent the server from starting.

## File Layout

Stage 1 should result in the following project-level changes.

### `pyproject.toml`

Add runtime dependencies for:

- `fastapi`
- `uvicorn`
- `jinja2`

The existing script entry point stays as `sayclearly = "sayclearly.main:main"`.

### `src/sayclearly/main.py`

Responsibility: CLI startup only.

This module should:

- define the fixed localhost host and port constants;
- build the application URL;
- attempt to open the browser to the local URL;
- create or import the FastAPI application;
- run Uvicorn.

This module should not contain route definitions, template wiring, storage logic, or future product logic.

### `src/sayclearly/app.py`

Responsibility: FastAPI application assembly.

This module should expose `create_app()` that returns a configured `FastAPI` instance. It should:

- register `GET /` to render the main HTML page;
- register `GET /api/health` to return a small JSON payload;
- mount the static directory;
- configure Jinja2 template rendering.

### `src/sayclearly/templates/index.html`

Responsibility: the first real application page.

The page should include:

- the product name `SayClearly`;
- a short description that this is a local diction training MVP;
- minimal structure that can later evolve into the home/setup screen;
- a linked stylesheet from `/static/styles.css`.

It should remain intentionally simple and should not pretend that Stage 3 UI already exists.

### `src/sayclearly/static/styles.css`

Responsibility: minimal presentational styling.

The stylesheet should make the page look intentional and readable, but it should remain lightweight and not attempt to solve future design work.

### `tests/test_smoke.py`

Responsibility: smoke coverage for the new runtime shell.

The tests should verify:

- the FastAPI app can be created;
- `GET /api/health` returns `200` with the expected JSON payload;
- `GET /` returns `200` and HTML containing `SayClearly`.

## Runtime Behavior

Running `uv run sayclearly` should behave as follows:

1. `main()` determines the fixed local host and port.
2. `main()` builds the application URL from those values.
3. `main()` attempts to open the browser to that URL using Python's standard browser support.
4. `main()` starts the FastAPI application through Uvicorn.
5. The app serves:
   - `GET /` as HTML;
   - `GET /api/health` as JSON;
   - `/static/*` as static assets.

Important runtime decisions:

- The browser-open attempt is best-effort. If it fails, server startup continues.
- The server binds only to `127.0.0.1`, not `0.0.0.0`.
- The health endpoint remains independent from future storage, configuration, and AI layers.
- The initial page is a shell, not a fake implementation of later MVP screens.

## Health Endpoint Contract

Stage 1 keeps the health response intentionally small and stable:

```json
{
  "status": "ok"
}
```

No extra metadata is needed yet.

## Port Choice

Stage 1 uses one fixed localhost port as a stable default. The purpose is predictability, not guaranteed uniqueness across all local projects.

The port selection should follow these practical rules:

- choose a non-privileged port above `1024`;
- avoid very common defaults such as `3000`, `8000`, and `8080` when a less common port is reasonable;
- keep the choice easy to remember;
- defer configurability until a later stage if the fixed default proves inconvenient.

Stage 1 does not add automatic free-port discovery or configurable port overrides.

## Testing Strategy

Automated verification should stay focused on behavior that matters in this stage.

### Automated tests

Use FastAPI's test client to verify the application without starting a real server process.

Required automated checks:

- creating the app succeeds;
- `GET /api/health` returns `200` and `{"status": "ok"}`;
- `GET /` returns `200` and contains `SayClearly` in the rendered HTML.

Testing browser opening or Uvicorn invocation through patching is optional for this stage and should only be added if the startup logic becomes materially more complex.

### Manual verification

The stage is manually verified when:

- `uv run sayclearly` starts without a traceback;
- the browser opens the local application page automatically;
- opening `/api/health` in the browser returns a successful health response.

## Completion Criteria

Stage 1 is complete when all of the following are true:

- the repository no longer relies on a placeholder `print()`-based CLI;
- a real FastAPI application exists;
- the app starts locally from one command;
- the browser opens automatically on startup;
- the root route serves a real HTML page;
- static assets are wired correctly;
- `GET /api/health` works;
- smoke tests reflect the new runtime behavior.

## Exit Criteria For This Stage

If the user can launch the app, see a simple local page, and successfully call the health endpoint, Stage 1 is done.

If implementation starts touching persistent storage, exercise flow state, recording, Gemini calls, or history, the work has crossed into later stages and should stop.
