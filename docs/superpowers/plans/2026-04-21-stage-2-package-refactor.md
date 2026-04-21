# Stage 2 Package Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the current Stage 2 code from flat top-level modules into the approved domain-oriented package layout, update the persistent style rules, and preserve all existing behavior and tests.

**Architecture:** Move flat Stage 2 modules into `config/`, `history/`, `storage/`, and `web/` packages while keeping `app.py` and `main.py` as stable entry points. Make this a pure structural refactor: first move storage, then config, then history, then shared web error handling, and finally update repo-wide style guidance and Ruff enforcement.

**Tech Stack:** Python 3.13+, FastAPI, Pydantic, pytest, ruff

---

## File Structure

- Create: `src/sayclearly/config/__init__.py` - empty package marker
- Create: `src/sayclearly/config/api.py` - config HTTP routes moved from flat module
- Create: `src/sayclearly/config/models.py` - config request/response models moved from flat module
- Create: `src/sayclearly/config/service.py` - config domain service moved from flat module
- Create: `src/sayclearly/history/__init__.py` - empty package marker
- Create: `src/sayclearly/history/api.py` - history HTTP routes moved from flat module
- Create: `src/sayclearly/history/service.py` - history domain service moved from flat module
- Create: `src/sayclearly/storage/__init__.py` - empty package marker
- Create: `src/sayclearly/storage/files.py` - storage file primitives moved from flat module
- Create: `src/sayclearly/storage/models.py` - storage boundary models moved from flat module
- Create: `src/sayclearly/web/__init__.py` - empty package marker
- Create: `src/sayclearly/web/errors.py` - shared FastAPI validation handler extracted from `app.py`
- Modify: `src/sayclearly/app.py` - import routers and shared error handler from new packages
- Modify: `tests/test_storage.py` - update imports after storage package move
- Modify: `tests/test_config_service.py` - update imports after config/storage package move
- Modify: `tests/test_history_service.py` - update imports after history/storage package move
- Modify: `tests/test_config_api.py` - update imports if needed after config package move
- Modify: `tests/test_history_api.py` - update imports if needed after history package move
- Modify: `AGENTS.md` - record package/layout and `__init__.py` style rules concisely
- Modify: `pyproject.toml` - add Ruff per-file ignore for `**/__init__.py`
- Modify: `docs/sayclearly_mvp_spec_en.md` - add implementation-time package layout decision
- Delete: `src/sayclearly/config_api.py`
- Delete: `src/sayclearly/config_models.py`
- Delete: `src/sayclearly/config_service.py`
- Delete: `src/sayclearly/history_api.py`
- Delete: `src/sayclearly/history_service.py`
- Delete: `src/sayclearly/storage.py`
- Delete: `src/sayclearly/storage_models.py`

### Task 1: Move Storage Modules Into `storage/`

**Files:**
- Create: `src/sayclearly/storage/__init__.py`
- Create: `src/sayclearly/storage/files.py`
- Create: `src/sayclearly/storage/models.py`
- Modify: `tests/test_storage.py`
- Delete: `src/sayclearly/storage.py`
- Delete: `src/sayclearly/storage_models.py`
- Test: `tests/test_storage.py`

- [ ] **Step 1: Write the failing import-update test changes**

Replace the imports at the top of `tests/test_storage.py` with:

```python
import json
from pathlib import Path

import pytest

from sayclearly.storage.files import (
    StorageError,
    load_config,
    load_history,
    load_secrets,
    save_config,
    save_history,
    save_secrets,
)
from sayclearly.storage.models import HistorySession, SessionAnalysis, StoredConfig, StoredSecrets
```

Keep the existing Task 1 tests unchanged below these imports.

- [ ] **Step 2: Run the storage tests to verify they fail on missing package modules**

Run: `uv run pytest tests/test_storage.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sayclearly.storage.files'`.

- [ ] **Step 3: Create the `storage/` package and move code into it**

Create `src/sayclearly/storage/__init__.py` as an empty file.

Create `src/sayclearly/storage/models.py` by moving the current contents of `src/sayclearly/storage_models.py` into it unchanged.

Create `src/sayclearly/storage/files.py` by moving the current contents of `src/sayclearly/storage.py` into it and updating the import to:

```python
from sayclearly.storage.models import HistoryStore, StoredConfig, StoredSecrets
```

Delete `src/sayclearly/storage.py` and `src/sayclearly/storage_models.py` after the moved package files exist.

- [ ] **Step 4: Run the storage tests to verify the move is behavior-preserving**

Run: `uv run pytest tests/test_storage.py -v`
Expected: PASS with all existing storage tests green.

- [ ] **Step 5: Commit the storage package move**

```bash
git add src/sayclearly/storage/__init__.py src/sayclearly/storage/files.py src/sayclearly/storage/models.py tests/test_storage.py
git rm src/sayclearly/storage.py src/sayclearly/storage_models.py
git commit -m "refactor: move storage code into package"
```

### Task 2: Move Config Modules Into `config/`

**Files:**
- Create: `src/sayclearly/config/__init__.py`
- Create: `src/sayclearly/config/models.py`
- Create: `src/sayclearly/config/service.py`
- Modify: `tests/test_config_service.py`
- Delete: `src/sayclearly/config_models.py`
- Delete: `src/sayclearly/config_service.py`
- Test: `tests/test_config_service.py`

- [ ] **Step 1: Write the failing import-update test changes**

Update the imports at the top of `tests/test_config_service.py` to:

```python
import json
from pathlib import Path

import pytest

from sayclearly.config.models import ConfigUpdatePayload
from sayclearly.config.service import ConfigService
```

Keep the rest of the file unchanged.

- [ ] **Step 2: Run the config service tests to verify they fail on missing package modules**

Run: `uv run pytest tests/test_config_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sayclearly.config.models'`.

- [ ] **Step 3: Create the `config/` package and move code into it**

Create `src/sayclearly/config/__init__.py` as an empty file.

Create `src/sayclearly/config/models.py` by moving the current contents of `src/sayclearly/config_models.py` into it unchanged.

Create `src/sayclearly/config/service.py` by moving the current contents of `src/sayclearly/config_service.py` into it and updating imports to:

```python
from sayclearly.config.models import (
    ConfigSource,
    ConfigUpdatePayload,
    GeminiPublicConfig,
    LangfusePublicConfig,
    PublicConfigView,
)
from sayclearly.storage.files import load_config, load_secrets, save_config, save_secrets
```

Delete `src/sayclearly/config_models.py` and `src/sayclearly/config_service.py` after the moved package files exist.

- [ ] **Step 4: Run the config service tests to verify the move is behavior-preserving**

Run: `uv run pytest tests/test_config_service.py -v`
Expected: PASS with all existing config service tests green.

- [ ] **Step 5: Commit the config package move**

```bash
git add src/sayclearly/config/__init__.py src/sayclearly/config/models.py src/sayclearly/config/service.py tests/test_config_service.py
git rm src/sayclearly/config_models.py src/sayclearly/config_service.py
git commit -m "refactor: move config code into package"
```

### Task 3: Move History Modules Into `history/`

**Files:**
- Create: `src/sayclearly/history/__init__.py`
- Create: `src/sayclearly/history/service.py`
- Modify: `tests/test_history_service.py`
- Delete: `src/sayclearly/history_service.py`
- Test: `tests/test_history_service.py`

- [ ] **Step 1: Write the failing import-update test changes**

Update the imports at the top of `tests/test_history_service.py` to:

```python
from pathlib import Path

import pytest

from sayclearly.history.service import HistoryService, HistorySessionNotFoundError
from sayclearly.storage.files import load_config, load_history, save_config
from sayclearly.storage.models import HistorySession, SessionAnalysis
```

Keep the rest of the file unchanged.

- [ ] **Step 2: Run the history service tests to verify they fail on missing package modules**

Run: `uv run pytest tests/test_history_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sayclearly.history.service'`.

- [ ] **Step 3: Create the `history/` package and move code into it**

Create `src/sayclearly/history/__init__.py` as an empty file.

Create `src/sayclearly/history/service.py` by moving the current contents of `src/sayclearly/history_service.py` into it and updating imports to:

```python
from sayclearly.storage.files import load_config, load_history, save_history
from sayclearly.storage.models import HistorySession, HistoryStore
```

Delete `src/sayclearly/history_service.py` after the moved package file exists.

- [ ] **Step 4: Run the history service tests to verify the move is behavior-preserving**

Run: `uv run pytest tests/test_history_service.py -v`
Expected: PASS with all existing history service tests green.

- [ ] **Step 5: Commit the history package move**

```bash
git add src/sayclearly/history/__init__.py src/sayclearly/history/service.py tests/test_history_service.py
git rm src/sayclearly/history_service.py
git commit -m "refactor: move history service into package"
```

### Task 4: Move API Modules Into Domain Packages And Extract `web/errors.py`

**Files:**
- Create: `src/sayclearly/config/api.py`
- Create: `src/sayclearly/history/api.py`
- Create: `src/sayclearly/web/__init__.py`
- Create: `src/sayclearly/web/errors.py`
- Modify: `src/sayclearly/app.py`
- Modify: `tests/test_config_api.py`
- Modify: `tests/test_history_api.py`
- Delete: `src/sayclearly/config_api.py`
- Delete: `src/sayclearly/history_api.py`
- Test: `tests/test_config_api.py`
- Test: `tests/test_history_api.py`

- [ ] **Step 1: Write the failing import-update test changes**

Replace the import in `tests/test_config_api.py` with:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from sayclearly.app import create_app
```

Replace the import in `tests/test_history_api.py` with:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from sayclearly.app import create_app
```

These imports already stay stable, so the failing condition in this task should come from `app.py` imports after you move the router modules in the next step.

- [ ] **Step 2: Temporarily update `app.py` imports to the package paths before the new files exist**

Change the imports at the top of `src/sayclearly/app.py` to:

```python
from sayclearly.config.api import build_config_router
from sayclearly.history.api import build_history_router
from sayclearly.web.errors import install_error_handlers
```

Leave the rest of `app.py` unchanged for this step.

- [ ] **Step 3: Run the API tests to verify they fail on missing package modules**

Run: `uv run pytest tests/test_config_api.py tests/test_history_api.py -v`
Expected: FAIL with `ModuleNotFoundError` for the new package import paths.

- [ ] **Step 4: Create the domain API packages and shared web error module**

Create `src/sayclearly/web/__init__.py` as an empty file.

Create `src/sayclearly/web/errors.py` with the current shared validation handler logic moved out of `app.py`:

```python
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

BAD_REQUEST_VALIDATION_ROUTES = {
    ("POST", "/api/config"),
    ("POST", "/api/history"),
}
BAD_REQUEST_VALIDATION_TYPES = {
    "extra_forbidden",
    "json_invalid",
    "missing",
    "model_attributes_type",
}


def _is_bad_request_validation_error(error: dict[str, Any]) -> bool:
    location = error.get("loc")
    return (
        isinstance(location, tuple)
        and bool(location)
        and location[0] == "body"
        and error.get("type") in BAD_REQUEST_VALIDATION_TYPES
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        route_key = (request.method, request.url.path)
        errors = exc.errors()
        status_code = 422
        if route_key in BAD_REQUEST_VALIDATION_ROUTES and all(
            _is_bad_request_validation_error(error) for error in errors
        ):
            status_code = 400
        return JSONResponse(
            status_code=status_code,
            content={"detail": jsonable_encoder(errors)},
        )
```

Create `src/sayclearly/config/api.py` by moving the current contents of `src/sayclearly/config_api.py` into it and updating imports to:

```python
from sayclearly.config.models import ConfigUpdatePayload, PublicConfigView
from sayclearly.config.service import ConfigService
from sayclearly.storage.files import StorageError
```

Create `src/sayclearly/history/api.py` by moving the current contents of `src/sayclearly/history_api.py` into it and updating imports to:

```python
from sayclearly.history.service import HistoryService, HistorySessionNotFoundError
from sayclearly.storage.files import StorageError
from sayclearly.storage.models import HistorySession, HistoryStore
```

Replace `src/sayclearly/app.py` with:

```python
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from sayclearly.config.api import build_config_router
from sayclearly.history.api import build_history_router
from sayclearly.web.errors import install_error_handlers

PACKAGE_ROOT = Path(__file__).resolve().parent
TEMPLATES_DIR = PACKAGE_ROOT / "templates"
STATIC_DIR = PACKAGE_ROOT / "static"


def create_app(data_root: Path | None = None) -> FastAPI:
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    app = FastAPI(
        title="SayClearly",
    )

    install_error_handlers(app)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.include_router(build_config_router(data_root))
    app.include_router(build_history_router(data_root))

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

Delete `src/sayclearly/config_api.py` and `src/sayclearly/history_api.py` after the moved package files exist.

- [ ] **Step 5: Run the API tests to verify the move is behavior-preserving**

Run: `uv run pytest tests/test_config_api.py tests/test_history_api.py -v`
Expected: PASS with all existing API tests green.

- [ ] **Step 6: Commit the API and web package move**

```bash
git add src/sayclearly/config/api.py src/sayclearly/history/api.py src/sayclearly/web/__init__.py src/sayclearly/web/errors.py src/sayclearly/app.py tests/test_config_api.py tests/test_history_api.py
git rm src/sayclearly/config_api.py src/sayclearly/history_api.py
git commit -m "refactor: organize api code by domain"
```

### Task 5: Record The Package Rules In The Canonical Files

**Files:**
- Modify: `docs/sayclearly_mvp_spec_en.md`
- Modify: `AGENTS.md`
- Modify: `pyproject.toml`
- Test: `uv run pytest`
- Test: `uv run ruff check .`
- Test: `uv run ruff format --check .`

- [ ] **Step 1: Write the failing lint/config expectation**

Add an empty package marker file to verify the future Ruff rule is needed:

Create `src/sayclearly/config/__init__.py` with no content if it does not already exist.

Then add a simple package re-export to `src/sayclearly/config/__init__.py`:

```python
from sayclearly.config.service import ConfigService
```

Run: `uv run ruff check src/sayclearly/config/__init__.py`
Expected: FAIL with `F401` before the per-file ignore is added.

- [ ] **Step 2: Update the canonical documents and Ruff config**

Add this new section to `docs/sayclearly_mvp_spec_en.md` after the current `## 18. Packaging and project structure` section:

```md
## 18.x Implementation-time decisions

The codebase should grow using a domain-oriented package structure rather than a global layer-based layout.

Recommended package shape:

```text
src/sayclearly/
  app.py
  main.py
  web/
    errors.py
  config/
    api.py
    models.py
    service.py
  history/
    api.py
    models.py
    service.py
  storage/
    files.py
    models.py
```

As later stages are implemented, new product areas should be added as their own domain packages, for example:

- `exercise/`
- `recording/`
- `analysis/`

### Responsibilities

- `app.py` assembles the FastAPI application and wires routers, shared handlers, and static assets.
- `main.py` contains CLI startup only.
- `web/` contains thin shared web concerns such as exception handlers.
- Each domain package owns its own `api.py`, `models.py`, and `service.py`.
- `storage/` contains low-level persistence code and persisted storage models shared across domains.
- Domain packages should not import each other's `api.py` modules.

### `__init__.py` style

By default, `__init__.py` files should stay empty.

Avoid routine package re-export boilerplate such as duplicated imports plus `__all__` declarations unless a package is intentionally exposing a small external interface. If package-level initialization is needed, prefer an explicit dedicated module instead of hidden import-time behavior.
```

Add these bullets to `AGENTS.md` under `## Code Style`:

```md
- Prefer a domain-oriented package structure for new code (`config/`, `history/`, `exercise/`, `recording/`, `analysis/`) instead of a project-wide `api/`, `services/`, `models/` split
- Keep `__init__.py` files empty by default
- Avoid routine re-export boilerplate and duplicated `__all__` declarations in `__init__.py`
```

Add this section to `pyproject.toml`:

```toml
[tool.ruff.lint.per-file-ignores]
"**/__init__.py" = ["F401"]
```

After adding the Ruff rule, restore `src/sayclearly/config/__init__.py` to an empty file.

- [ ] **Step 3: Run the full verification suite to confirm behavior stayed unchanged**

Run: `uv run pytest`
Expected: PASS with the full existing suite green.

Run: `uv run ruff check .`
Expected: PASS with the new package layout and `__init__.py` policy accepted.

Run: `uv run ruff format --check .`
Expected: PASS with no formatting changes needed.

- [ ] **Step 4: Commit the package rules and final refactor**

```bash
git add docs/sayclearly_mvp_spec_en.md AGENTS.md pyproject.toml src/sayclearly/config/__init__.py src/sayclearly/history/__init__.py src/sayclearly/storage/__init__.py src/sayclearly/web/__init__.py
git commit -m "refactor: adopt domain package layout"
```

## Self-Review Checklist

- Spec coverage: the plan covers the approved package layout, `web/errors.py`, empty `__init__.py` style, canonical rule placement in the MVP spec and `AGENTS.md`, and Ruff enforcement in `pyproject.toml`.
- Placeholder scan: no `TBD`, `TODO`, or deferred pseudo-steps remain.
- Type consistency: all package moves keep the same public names (`ConfigService`, `HistoryService`, `StorageError`, `PublicConfigView`, `HistoryStore`, `HistorySession`) so the refactor stays structural rather than behavioral.
