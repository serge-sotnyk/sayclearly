# Stage 1 Local Runtime Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder CLI with a runnable FastAPI shell that starts locally, opens the browser, serves a real HTML page, and exposes a health endpoint.

**Architecture:** Keep HTTP assembly in `src/sayclearly/app.py` through a small `create_app()` factory and keep process startup concerns in `src/sayclearly/main.py`. Use Jinja2 templates plus mounted static assets for the initial page, and verify behavior with FastAPI `TestClient`, launcher unit tests, and a final manual startup check.

**Tech Stack:** Python 3.13+, FastAPI, Uvicorn, Jinja2, pytest, httpx, ruff

---

## File Structure

- Modify: `pyproject.toml` - add FastAPI, Uvicorn, Jinja2, and `httpx` for tests
- Create: `src/sayclearly/app.py` - FastAPI app factory, root route, health route, template/static wiring
- Modify: `src/sayclearly/main.py` - fixed localhost launcher, best-effort browser opening, Uvicorn startup
- Create: `src/sayclearly/templates/index.html` - first local MVP shell page
- Create: `src/sayclearly/static/styles.css` - minimal page styling
- Modify: `tests/test_smoke.py` - app and launcher smoke tests
- Modify: `README.md` - note the real local runtime behavior and health endpoint

### Task 1: Add Runtime Dependencies

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Update runtime and test dependencies**

Replace the dependency sections in `pyproject.toml` with:

```toml
[project]
name = "sayclearly"
version = "0.1.0"
description = "Local diction training tool with Gemini-based feedback."
readme = "README.md"
requires-python = ">=3.13"
dependencies = [
    "fastapi>=0.115.12",
    "jinja2>=3.1.6",
    "uvicorn>=0.35.0",
]

[project.scripts]
sayclearly = "sayclearly.main:main"

[dependency-groups]
dev = [
    "httpx>=0.28.1",
    "pytest>=9.0.3",
    "ruff>=0.15.11",
]

[tool.ruff]
target-version = "py313"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]

[tool.pytest.ini_options]
testpaths = ["tests"]

[build-system]
requires = ["uv_build>=0.10.12,<0.11.0"]
build-backend = "uv_build"
```

- [ ] **Step 2: Sync the environment**

Run: `uv sync`
Expected: dependency resolution succeeds and installs `fastapi`, `jinja2`, `uvicorn`, and `httpx` with no errors.

- [ ] **Step 3: Commit the dependency update**

```bash
git add pyproject.toml uv.lock
git commit -m "build: add web runtime dependencies"
```

### Task 2: Create The App Factory And Health Endpoint

**Files:**
- Create: `src/sayclearly/app.py`
- Modify: `tests/test_smoke.py`
- Test: `tests/test_smoke.py`

- [ ] **Step 1: Write the failing health tests**

Replace `tests/test_smoke.py` with:

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sayclearly.app import create_app


def test_create_app_returns_fastapi_instance() -> None:
    app = create_app()

    assert isinstance(app, FastAPI)


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_smoke.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sayclearly.app'`.

- [ ] **Step 3: Write the minimal app factory implementation**

Create `src/sayclearly/app.py` with:

```python
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="SayClearly")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/test_smoke.py -v`
Expected: PASS for `test_create_app_returns_fastapi_instance` and `test_health_endpoint_returns_ok`.

- [ ] **Step 5: Commit the app factory skeleton**

```bash
git add tests/test_smoke.py src/sayclearly/app.py
git commit -m "feat: add FastAPI health endpoint"
```

### Task 3: Render The Root Page And Mount Static Assets

**Files:**
- Modify: `src/sayclearly/app.py`
- Create: `src/sayclearly/templates/index.html`
- Create: `src/sayclearly/static/styles.css`
- Modify: `tests/test_smoke.py`
- Test: `tests/test_smoke.py`

- [ ] **Step 1: Write the failing root-page test**

Update `tests/test_smoke.py` to:

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sayclearly.app import create_app


def test_create_app_returns_fastapi_instance() -> None:
    app = create_app()

    assert isinstance(app, FastAPI)


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_home_page_renders_local_shell() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "SayClearly" in response.text
    assert "/static/styles.css" in response.text
```

- [ ] **Step 2: Run the tests to verify the new test fails**

Run: `uv run pytest tests/test_smoke.py -v`
Expected: FAIL for `test_home_page_renders_local_shell` with `404 != 200`.

- [ ] **Step 3: Implement template rendering and static mounting**

Replace `src/sayclearly/app.py` with:

```python
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates


PACKAGE_ROOT = Path(__file__).resolve().parent
TEMPLATES_DIR = PACKAGE_ROOT / "templates"
STATIC_DIR = PACKAGE_ROOT / "static"


def create_app() -> FastAPI:
    app = FastAPI(title="SayClearly")
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    def home(request: Request):
        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={"page_title": "SayClearly"},
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

Create `src/sayclearly/templates/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{ page_title }}</title>
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body>
    <main class="page-shell">
      <p class="eyebrow">Local-only MVP</p>
      <h1>SayClearly</h1>
      <p class="lead">
        A calm local diction practice tool with a web UI and Gemini-based feedback.
      </p>
      <p class="hint">
        Stage 1 provides the runtime shell. Exercise setup, recording, and analysis arrive in later stages.
      </p>
    </main>
  </body>
</html>
```

Create `src/sayclearly/static/styles.css` with:

```css
:root {
    color-scheme: light;
    font-family: Inter, "Segoe UI", sans-serif;
    background: #f7f4ef;
    color: #1f2933;
}

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background:
        radial-gradient(circle at top, #fff9ef, #f7f4ef 50%),
        #f7f4ef;
}

.page-shell {
    width: min(42rem, calc(100% - 2rem));
    padding: 3rem;
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.86);
    box-shadow: 0 1.5rem 4rem rgba(15, 23, 42, 0.08);
}

.eyebrow {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8a6d3b;
}

h1 {
    margin: 0;
    font-size: clamp(2.5rem, 6vw, 3.5rem);
}

.lead,
.hint {
    max-width: 36rem;
    line-height: 1.6;
}

.lead {
    margin: 1rem 0 0;
    font-size: 1.1rem;
}

.hint {
    margin: 1rem 0 0;
    color: #52606d;
}
```

- [ ] **Step 4: Run the tests to verify the root page passes**

Run: `uv run pytest tests/test_smoke.py -v`
Expected: PASS for all three smoke tests.

- [ ] **Step 5: Commit the rendered page shell**

```bash
git add tests/test_smoke.py src/sayclearly/app.py src/sayclearly/templates/index.html src/sayclearly/static/styles.css
git commit -m "feat: add initial local web shell"
```

### Task 4: Replace The Placeholder CLI With A Local Launcher

**Files:**
- Modify: `src/sayclearly/main.py`
- Modify: `tests/test_smoke.py`
- Test: `tests/test_smoke.py`

- [ ] **Step 1: Write the failing launcher tests**

Replace `tests/test_smoke.py` with:

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

import sayclearly.main as main_module
from sayclearly.app import create_app


def test_create_app_returns_fastapi_instance() -> None:
    app = create_app()

    assert isinstance(app, FastAPI)


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_home_page_renders_local_shell() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "SayClearly" in response.text
    assert "/static/styles.css" in response.text


def test_main_opens_browser_and_starts_server(monkeypatch) -> None:
    opened_urls: list[str] = []
    run_calls: list[tuple[object, str, int]] = []

    def fake_open(url: str) -> bool:
        opened_urls.append(url)
        return True

    def fake_run(app: object, host: str, port: int) -> None:
        run_calls.append((app, host, port))

    monkeypatch.setattr(main_module.webbrowser, "open", fake_open)
    monkeypatch.setattr(main_module.uvicorn, "run", fake_run)

    main_module.main()

    assert opened_urls == [f"http://{main_module.HOST}:{main_module.PORT}/"]
    assert len(run_calls) == 1
    app, host, port = run_calls[0]
    assert isinstance(app, FastAPI)
    assert host == main_module.HOST
    assert port == main_module.PORT


def test_main_starts_server_when_browser_open_fails(monkeypatch) -> None:
    run_calls: list[tuple[object, str, int]] = []

    def fake_open(url: str) -> bool:
        raise RuntimeError("browser unavailable")

    def fake_run(app: object, host: str, port: int) -> None:
        run_calls.append((app, host, port))

    monkeypatch.setattr(main_module.webbrowser, "open", fake_open)
    monkeypatch.setattr(main_module.uvicorn, "run", fake_run)

    main_module.main()

    assert len(run_calls) == 1
```

- [ ] **Step 2: Run the tests to verify the launcher tests fail**

Run: `uv run pytest tests/test_smoke.py -v`
Expected: FAIL because `main()` still prints the placeholder message and never calls `webbrowser.open()` or `uvicorn.run()`.

- [ ] **Step 3: Implement the launcher logic**

Replace `src/sayclearly/main.py` with:

```python
"""CLI entry point for the local SayClearly web app."""

import logging
import webbrowser

import uvicorn

from sayclearly.app import create_app


HOST = "127.0.0.1"
PORT = 8008


def main() -> None:
    url = f"http://{HOST}:{PORT}/"

    try:
        webbrowser.open(url)
    except Exception:
        logging.getLogger(__name__).warning(
            "Could not open browser automatically.",
            exc_info=True,
        )

    uvicorn.run(create_app(), host=HOST, port=PORT)
```

- [ ] **Step 4: Run the tests to verify the launcher passes**

Run: `uv run pytest tests/test_smoke.py -v`
Expected: PASS for all five tests.

- [ ] **Step 5: Commit the launcher implementation**

```bash
git add tests/test_smoke.py src/sayclearly/main.py
git commit -m "feat: launch local app in browser"
```

### Task 5: Run Full Verification And Manual Startup Check

**Files:**
- Modify: `README.md`
- Test: `tests/test_smoke.py`

- [ ] **Step 1: Update the run instructions to match the real web shell**

Append this note under the `### Run` section in `README.md`:

```markdown
Running `uv run sayclearly` starts the local FastAPI server on `127.0.0.1:8008`, opens the app in your browser, and exposes a simple health endpoint at `/api/health`.
```

- [ ] **Step 2: Run the full automated verification suite**

Run: `uv run pytest && uv run ruff check . && uv run ruff format --check .`
Expected: all commands exit successfully with no test failures, lint errors, or formatting diffs.

- [ ] **Step 3: Run the app manually**

Run: `uv run sayclearly`
Expected: Uvicorn starts on `http://127.0.0.1:8008`, the browser opens automatically, and the page shows the `SayClearly` shell.

- [ ] **Step 4: Verify the health endpoint from a second terminal**

Run: `Invoke-RestMethod "http://127.0.0.1:8008/api/health"`
Expected:

```powershell
status
------
ok
```

- [ ] **Step 5: Stop the server and commit the final Stage 1 polish**

Stop the running server with `Ctrl+C`, then run:

```bash
git add README.md
git commit -m "docs: note local runtime behavior"
```

## Self-Review Checklist

- Spec coverage:
  - one-command local startup -> Task 4 and Task 5
  - real HTML page -> Task 3
  - static asset wiring -> Task 3
  - `GET /api/health` -> Task 2
  - browser opening -> Task 4 and Task 5
  - fixed localhost runtime -> Task 4
- Placeholder scan: no `TODO`, `TBD`, or vague "handle this later" steps remain.
- Type consistency:
  - `create_app()` is introduced in Task 2 and reused consistently in later tasks;
  - `HOST` and `PORT` are introduced in Task 4 and referenced consistently in launcher tests and manual verification.
