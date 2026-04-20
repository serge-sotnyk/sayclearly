# Stage 2 Local Data And Storage Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable local storage under `~/.sayclearly/` with versioned JSON files, atomic writes, config/history APIs, secret-status responses, and pragmatic test coverage for the storage foundation.

**Architecture:** Keep filesystem persistence in one focused storage module plus typed models, then layer `ConfigService` and `HistoryService` over it so the API never touches files directly. Extend `create_app()` with an optional `data_root` argument for tests, and register thin config/history routers that translate service results into stable JSON contracts.

**Tech Stack:** Python 3.13+, FastAPI, Pydantic, pytest, httpx, ruff

---

## File Structure

- Create: `src/sayclearly/storage_models.py` - typed models for stored config, secrets, and history documents
- Create: `src/sayclearly/storage.py` - storage root setup, atomic JSON read/write helpers, storage load/save functions, storage errors
- Create: `src/sayclearly/config_models.py` - request and response models for the config API and config service
- Create: `src/sayclearly/config_service.py` - effective config assembly, env overrides, config writes, Gemini key clearing
- Create: `src/sayclearly/history_service.py` - history reads, writes, lookup, and trimming
- Create: `src/sayclearly/config_api.py` - `/api/config` and `/api/config/api-key` routes
- Create: `src/sayclearly/history_api.py` - `/api/history` routes
- Modify: `src/sayclearly/app.py` - include config/history routers and accept an optional storage root
- Create: `tests/test_storage.py` - storage layer tests
- Create: `tests/test_config_service.py` - config service tests
- Create: `tests/test_history_service.py` - history service tests
- Create: `tests/test_config_api.py` - config API tests
- Create: `tests/test_history_api.py` - history API tests

### Task 1: Add Typed Storage Models And JSON Persistence Primitives

**Files:**
- Create: `src/sayclearly/storage_models.py`
- Create: `src/sayclearly/storage.py`
- Create: `tests/test_storage.py`
- Test: `tests/test_storage.py`

- [ ] **Step 1: Write the failing storage tests**

Create `tests/test_storage.py` with:

```python
import json
from pathlib import Path

import pytest

from sayclearly.storage import StorageError, load_config, load_history, load_secrets, save_config


def test_load_config_creates_default_storage_tree(tmp_path: Path) -> None:
    config = load_config(tmp_path)

    assert config.version == 1
    assert config.text_language == "uk"
    assert (tmp_path / "cache").is_dir()
    assert json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))["version"] == 1
    assert json.loads((tmp_path / "secrets.json").read_text(encoding="utf-8")) == {
        "version": 1,
        "gemini": {},
        "langfuse": {},
    }
    assert json.loads((tmp_path / "history.json").read_text(encoding="utf-8")) == {
        "version": 1,
        "sessions": [],
    }
    assert load_secrets(tmp_path).version == 1
    assert load_history(tmp_path).version == 1


def test_save_config_replaces_the_previous_document(tmp_path: Path) -> None:
    config = load_config(tmp_path)

    save_config(tmp_path, config.model_copy(update={"text_language": "en"}))

    assert load_config(tmp_path).text_language == "en"
    assert list(tmp_path.glob("*.tmp")) == []


def test_load_config_raises_storage_error_for_malformed_json(tmp_path: Path) -> None:
    load_config(tmp_path)
    (tmp_path / "config.json").write_text("{bad json", encoding="utf-8")

    with pytest.raises(StorageError, match="Invalid JSON"):
        load_config(tmp_path)
```

- [ ] **Step 2: Run the storage tests to verify they fail**

Run: `uv run pytest tests/test_storage.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sayclearly.storage'`.

- [ ] **Step 3: Write the minimal storage models and storage implementation**

Create `src/sayclearly/storage_models.py` with:

```python
from pydantic import BaseModel, ConfigDict, Field


class GeminiConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str = "gemini-2.5-flash"


class LangfuseConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: str | None = None


class StoredConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 1
    text_language: str = "uk"
    analysis_language: str = "uk"
    ui_language: str = "en"
    same_language_for_analysis: bool = True
    last_topic_prompt: str = ""
    session_limit: int = 300
    keep_last_audio: bool = False
    gemini: GeminiConfig = Field(default_factory=GeminiConfig)
    langfuse: LangfuseConfig = Field(default_factory=LangfuseConfig)


class GeminiSecrets(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_key: str | None = None


class LangfuseSecrets(BaseModel):
    model_config = ConfigDict(extra="forbid")

    public_key: str | None = None
    secret_key: str | None = None


class StoredSecrets(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 1
    gemini: GeminiSecrets = Field(default_factory=GeminiSecrets)
    langfuse: LangfuseSecrets = Field(default_factory=LangfuseSecrets)


class Hesitation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: float
    end: float
    note: str


class SessionAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clarity_score: int
    pace_score: int
    hesitations: list[Hesitation] = Field(default_factory=list)
    summary: list[str] = Field(default_factory=list)


class HistorySession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    created_at: str
    language: str
    topic_prompt: str | None = None
    text: str
    analysis: SessionAnalysis


class HistoryStore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 1
    sessions: list[HistorySession] = Field(default_factory=list)
```

Create `src/sayclearly/storage.py` with:

```python
import json
import os
import tempfile
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from sayclearly.storage_models import HistoryStore, StoredConfig, StoredSecrets

APP_DIR_NAME = ".sayclearly"
CONFIG_FILE_NAME = "config.json"
SECRETS_FILE_NAME = "secrets.json"
HISTORY_FILE_NAME = "history.json"
CACHE_DIR_NAME = "cache"

ModelT = TypeVar("ModelT", bound=BaseModel)


class StorageError(RuntimeError):
    """Raised when local storage cannot be read or written safely."""


def default_data_root() -> Path:
    return Path.home() / APP_DIR_NAME


def ensure_storage_root(data_root: Path | None = None) -> Path:
    root = data_root or default_data_root()

    try:
        root.mkdir(parents=True, exist_ok=True)
        (root / CACHE_DIR_NAME).mkdir(exist_ok=True)
    except OSError as exc:
        raise StorageError(f"Could not create storage root at {root}") from exc

    _ensure_default_file(root / CONFIG_FILE_NAME, StoredConfig())
    _ensure_default_file(root / SECRETS_FILE_NAME, StoredSecrets())
    _ensure_default_file(root / HISTORY_FILE_NAME, HistoryStore())
    return root


def atomic_write_json(path: Path, data: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_path = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=True, indent=2)
            handle.write("\n")
        os.replace(temporary_path, path)
    except OSError as exc:
        raise StorageError(f"Could not write {path}") from exc
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def _ensure_default_file(path: Path, model: BaseModel) -> None:
    if path.exists():
        return
    atomic_write_json(path, model.model_dump(mode="json", exclude_none=True))


def _load_model(path: Path, model_type: type[ModelT], default_model: ModelT) -> ModelT:
    if not path.exists():
        atomic_write_json(path, default_model.model_dump(mode="json", exclude_none=True))
        return default_model

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise StorageError(f"Invalid JSON in {path}") from exc
    except OSError as exc:
        raise StorageError(f"Could not read {path}") from exc

    try:
        return model_type.model_validate(payload)
    except ValidationError as exc:
        raise StorageError(f"Invalid data in {path}") from exc


def load_config(data_root: Path | None = None) -> StoredConfig:
    root = ensure_storage_root(data_root)
    return _load_model(root / CONFIG_FILE_NAME, StoredConfig, StoredConfig())


def save_config(data_root: Path | None, config: StoredConfig) -> None:
    root = ensure_storage_root(data_root)
    atomic_write_json(
        root / CONFIG_FILE_NAME,
        config.model_dump(mode="json", exclude_none=True),
    )


def load_secrets(data_root: Path | None = None) -> StoredSecrets:
    root = ensure_storage_root(data_root)
    return _load_model(root / SECRETS_FILE_NAME, StoredSecrets, StoredSecrets())


def save_secrets(data_root: Path | None, secrets: StoredSecrets) -> None:
    root = ensure_storage_root(data_root)
    atomic_write_json(
        root / SECRETS_FILE_NAME,
        secrets.model_dump(mode="json", exclude_none=True),
    )


def load_history(data_root: Path | None = None) -> HistoryStore:
    root = ensure_storage_root(data_root)
    return _load_model(root / HISTORY_FILE_NAME, HistoryStore, HistoryStore())


def save_history(data_root: Path | None, history: HistoryStore) -> None:
    root = ensure_storage_root(data_root)
    atomic_write_json(
        root / HISTORY_FILE_NAME,
        history.model_dump(mode="json", exclude_none=True),
    )
```

- [ ] **Step 4: Run the storage tests to verify they pass**

Run: `uv run pytest tests/test_storage.py -v`
Expected: PASS with 3 passed tests.

- [ ] **Step 5: Commit the storage foundation**

```bash
git add src/sayclearly/storage_models.py src/sayclearly/storage.py tests/test_storage.py
git commit -m "feat: add local storage primitives"
```

### Task 2: Add Config Request Models And Config Service

**Files:**
- Create: `src/sayclearly/config_models.py`
- Create: `src/sayclearly/config_service.py`
- Create: `tests/test_config_service.py`
- Test: `tests/test_config_service.py`

- [ ] **Step 1: Write the failing config service tests**

Create `tests/test_config_service.py` with:

```python
import json
from pathlib import Path

from sayclearly.config_models import ConfigUpdatePayload
from sayclearly.config_service import ConfigService


def make_payload(**overrides: object) -> ConfigUpdatePayload:
    payload = {
        "text_language": "en",
        "analysis_language": "uk",
        "same_language_for_analysis": False,
        "ui_language": "en",
        "last_topic_prompt": "interesting facts about astronomy",
        "session_limit": 123,
        "keep_last_audio": True,
        "gemini": {"model": "gemini-2.5-flash", "api_key": "stored-gemini"},
        "langfuse": {
            "host": "https://langfuse.example",
            "public_key": "stored-public",
            "secret_key": "stored-secret",
        },
    }
    payload.update(overrides)
    return ConfigUpdatePayload.model_validate(payload)


def test_get_public_config_hides_secrets_and_reports_effective_sources(
    tmp_path: Path,
    monkeypatch,
) -> None:
    service = ConfigService(tmp_path)
    service.update_config(make_payload())
    monkeypatch.setenv("GEMINI_API_KEY", "env-gemini")
    monkeypatch.setenv("LANGFUSE_HOST", "https://env-langfuse.example")

    public = service.get_public_config()

    assert public.text_language == "en"
    assert public.gemini.model == "gemini-2.5-flash"
    assert public.gemini.has_api_key is True
    assert public.gemini.api_key_source == "env"
    assert public.langfuse.host == "https://env-langfuse.example"
    assert public.langfuse.has_public_key is True
    assert public.langfuse.public_key_source == "stored"
    assert public.langfuse.has_secret_key is True
    assert public.langfuse.secret_key_source == "stored"
    assert public.langfuse.enabled is True
    assert public.model_dump()["gemini"] == {
        "model": "gemini-2.5-flash",
        "has_api_key": True,
        "api_key_source": "env",
    }


def test_update_config_persists_public_and_secret_values_in_separate_files(tmp_path: Path) -> None:
    service = ConfigService(tmp_path)

    public = service.update_config(make_payload())

    assert public.session_limit == 123
    assert json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))["session_limit"] == 123
    assert json.loads((tmp_path / "secrets.json").read_text(encoding="utf-8"))["gemini"] == {
        "api_key": "stored-gemini"
    }


def test_clear_stored_gemini_api_key_keeps_environment_override_effective(
    tmp_path: Path,
    monkeypatch,
) -> None:
    service = ConfigService(tmp_path)
    service.update_config(make_payload())
    monkeypatch.setenv("GEMINI_API_KEY", "env-gemini")

    public = service.clear_stored_gemini_api_key()

    assert public.gemini.has_api_key is True
    assert public.gemini.api_key_source == "env"
    assert json.loads((tmp_path / "secrets.json").read_text(encoding="utf-8"))["gemini"] == {}
```

- [ ] **Step 2: Run the config service tests to verify they fail**

Run: `uv run pytest tests/test_config_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sayclearly.config_models'`.

- [ ] **Step 3: Write the config models and config service**

Create `src/sayclearly/config_models.py` with:

```python
from typing import Literal

from pydantic import BaseModel, ConfigDict

ConfigSource = Literal["env", "stored", "none"]


class GeminiConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str
    api_key: str | None = None


class LangfuseConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: str | None = None
    public_key: str | None = None
    secret_key: str | None = None


class ConfigUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text_language: str
    analysis_language: str
    same_language_for_analysis: bool
    ui_language: str
    last_topic_prompt: str
    session_limit: int
    keep_last_audio: bool
    gemini: GeminiConfigUpdate
    langfuse: LangfuseConfigUpdate


class GeminiPublicConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str
    has_api_key: bool
    api_key_source: ConfigSource


class LangfusePublicConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: str | None
    enabled: bool
    has_public_key: bool
    has_secret_key: bool
    public_key_source: ConfigSource
    secret_key_source: ConfigSource


class PublicConfigView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    text_language: str
    analysis_language: str
    same_language_for_analysis: bool
    ui_language: str
    last_topic_prompt: str
    session_limit: int
    keep_last_audio: bool
    gemini: GeminiPublicConfig
    langfuse: LangfusePublicConfig
```

Create `src/sayclearly/config_service.py` with:

```python
import os
from pathlib import Path
from typing import Literal

from sayclearly.config_models import (
    ConfigSource,
    ConfigUpdatePayload,
    GeminiPublicConfig,
    LangfusePublicConfig,
    PublicConfigView,
)
from sayclearly.storage import load_config, load_secrets, save_config, save_secrets


class ConfigService:
    def __init__(self, data_root: Path | None = None) -> None:
        self.data_root = data_root

    def get_public_config(self) -> PublicConfigView:
        stored_config = load_config(self.data_root)
        stored_secrets = load_secrets(self.data_root)

        gemini_api_key, gemini_source = self._resolve_secret(
            env_name="GEMINI_API_KEY",
            stored_value=stored_secrets.gemini.api_key,
        )
        langfuse_public_key, public_key_source = self._resolve_secret(
            env_name="LANGFUSE_PUBLIC_KEY",
            stored_value=stored_secrets.langfuse.public_key,
        )
        langfuse_secret_key, secret_key_source = self._resolve_secret(
            env_name="LANGFUSE_SECRET_KEY",
            stored_value=stored_secrets.langfuse.secret_key,
        )
        langfuse_host, _ = self._resolve_value(
            env_name="LANGFUSE_HOST",
            stored_value=stored_config.langfuse.host,
        )

        return PublicConfigView(
            version=stored_config.version,
            text_language=stored_config.text_language,
            analysis_language=stored_config.analysis_language,
            same_language_for_analysis=stored_config.same_language_for_analysis,
            ui_language=stored_config.ui_language,
            last_topic_prompt=stored_config.last_topic_prompt,
            session_limit=stored_config.session_limit,
            keep_last_audio=stored_config.keep_last_audio,
            gemini=GeminiPublicConfig(
                model=stored_config.gemini.model,
                has_api_key=bool(gemini_api_key),
                api_key_source=gemini_source,
            ),
            langfuse=LangfusePublicConfig(
                host=langfuse_host,
                enabled=bool(langfuse_host and langfuse_public_key and langfuse_secret_key),
                has_public_key=bool(langfuse_public_key),
                has_secret_key=bool(langfuse_secret_key),
                public_key_source=public_key_source,
                secret_key_source=secret_key_source,
            ),
        )

    def update_config(self, payload: ConfigUpdatePayload) -> PublicConfigView:
        stored_config = load_config(self.data_root)
        stored_secrets = load_secrets(self.data_root)

        stored_config.text_language = payload.text_language
        stored_config.analysis_language = payload.analysis_language
        stored_config.same_language_for_analysis = payload.same_language_for_analysis
        stored_config.ui_language = payload.ui_language
        stored_config.last_topic_prompt = payload.last_topic_prompt
        stored_config.session_limit = payload.session_limit
        stored_config.keep_last_audio = payload.keep_last_audio
        stored_config.gemini.model = payload.gemini.model
        stored_config.langfuse.host = payload.langfuse.host

        if payload.gemini.api_key is not None:
            stored_secrets.gemini.api_key = payload.gemini.api_key
        if payload.langfuse.public_key is not None:
            stored_secrets.langfuse.public_key = payload.langfuse.public_key
        if payload.langfuse.secret_key is not None:
            stored_secrets.langfuse.secret_key = payload.langfuse.secret_key

        save_config(self.data_root, stored_config)
        save_secrets(self.data_root, stored_secrets)
        return self.get_public_config()

    def clear_stored_gemini_api_key(self) -> PublicConfigView:
        stored_secrets = load_secrets(self.data_root)
        stored_secrets.gemini.api_key = None
        save_secrets(self.data_root, stored_secrets)
        return self.get_public_config()

    def _resolve_secret(
        self,
        *,
        env_name: str,
        stored_value: str | None,
    ) -> tuple[str | None, ConfigSource]:
        env_value = os.getenv(env_name)
        if env_value:
            return env_value, "env"
        if stored_value:
            return stored_value, "stored"
        return None, "none"

    def _resolve_value(
        self,
        *,
        env_name: str,
        stored_value: str | None,
    ) -> tuple[str | None, Literal["env", "stored", "none"]]:
        env_value = os.getenv(env_name)
        if env_value:
            return env_value, "env"
        if stored_value:
            return stored_value, "stored"
        return None, "none"
```

- [ ] **Step 4: Run the config service tests to verify they pass**

Run: `uv run pytest tests/test_config_service.py -v`
Expected: PASS with 3 passed tests.

- [ ] **Step 5: Commit the config service layer**

```bash
git add src/sayclearly/config_models.py src/sayclearly/config_service.py tests/test_config_service.py
git commit -m "feat: add effective config service"
```

### Task 3: Add History Service With Session Limit Enforcement

**Files:**
- Create: `src/sayclearly/history_service.py`
- Create: `tests/test_history_service.py`
- Test: `tests/test_history_service.py`

- [ ] **Step 1: Write the failing history service tests**

Create `tests/test_history_service.py` with:

```python
from pathlib import Path

import pytest

from sayclearly.history_service import HistoryService, HistorySessionNotFoundError
from sayclearly.storage import load_config, save_config
from sayclearly.storage_models import HistorySession, SessionAnalysis


def make_session(session_id: str) -> HistorySession:
    return HistorySession(
        id=session_id,
        created_at=f"2026-04-20T10:00:{session_id.zfill(2)}",
        language="uk",
        topic_prompt="interesting facts",
        text=f"Generated text {session_id}",
        analysis=SessionAnalysis(
            clarity_score=7,
            pace_score=6,
            summary=[f"Summary {session_id}"],
        ),
    )


def test_save_session_keeps_newest_entry_first(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)
    service.save_session(make_session("01"))

    history = service.save_session(make_session("02"))

    assert [session.id for session in history.sessions] == ["02", "01"]


def test_save_session_trims_to_configured_limit(tmp_path: Path) -> None:
    config = load_config(tmp_path)
    save_config(tmp_path, config.model_copy(update={"session_limit": 1}))
    service = HistoryService(tmp_path)

    service.save_session(make_session("01"))
    history = service.save_session(make_session("02"))

    assert [session.id for session in history.sessions] == ["02"]


def test_get_session_raises_for_missing_id(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)

    with pytest.raises(HistorySessionNotFoundError, match="missing"):
        service.get_session("missing")
```

- [ ] **Step 2: Run the history service tests to verify they fail**

Run: `uv run pytest tests/test_history_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sayclearly.history_service'`.

- [ ] **Step 3: Write the history service**

Create `src/sayclearly/history_service.py` with:

```python
from pathlib import Path

from sayclearly.storage import load_config, load_history, save_history
from sayclearly.storage_models import HistorySession, HistoryStore


class HistorySessionNotFoundError(LookupError):
    """Raised when a requested session id is not present in history."""


class HistoryService:
    def __init__(self, data_root: Path | None = None) -> None:
        self.data_root = data_root

    def list_history(self) -> HistoryStore:
        return load_history(self.data_root)

    def get_session(self, session_id: str) -> HistorySession:
        history = load_history(self.data_root)
        for session in history.sessions:
            if session.id == session_id:
                return session
        raise HistorySessionNotFoundError(session_id)

    def save_session(self, session: HistorySession) -> HistoryStore:
        history = load_history(self.data_root)
        config = load_config(self.data_root)

        remaining_sessions = [existing for existing in history.sessions if existing.id != session.id]
        remaining_sessions.insert(0, session)
        history.sessions = remaining_sessions[: config.session_limit]

        save_history(self.data_root, history)
        return history
```

- [ ] **Step 4: Run the history service tests to verify they pass**

Run: `uv run pytest tests/test_history_service.py -v`
Expected: PASS with 3 passed tests.

- [ ] **Step 5: Commit the history service layer**

```bash
git add src/sayclearly/history_service.py tests/test_history_service.py
git commit -m "feat: add history persistence service"
```

### Task 4: Add Config API Routes And Wire Them Into The App

**Files:**
- Create: `src/sayclearly/config_api.py`
- Modify: `src/sayclearly/app.py`
- Create: `tests/test_config_api.py`
- Test: `tests/test_config_api.py`

- [ ] **Step 1: Write the failing config API tests**

Create `tests/test_config_api.py` with:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from sayclearly.app import create_app


def make_payload() -> dict[str, object]:
    return {
        "text_language": "en",
        "analysis_language": "uk",
        "same_language_for_analysis": False,
        "ui_language": "en",
        "last_topic_prompt": "interesting facts about astronomy",
        "session_limit": 250,
        "keep_last_audio": False,
        "gemini": {"model": "gemini-2.5-flash", "api_key": "stored-gemini"},
        "langfuse": {
            "host": "https://langfuse.example",
            "public_key": "stored-public",
            "secret_key": "stored-secret",
        },
    }


def test_get_config_returns_public_contract(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json()["gemini"] == {
        "model": "gemini-2.5-flash",
        "has_api_key": False,
        "api_key_source": "none",
    }


def test_post_config_persists_changes_across_app_recreation(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    post_response = client.post("/api/config", json=make_payload())
    second_client = TestClient(create_app(tmp_path))
    get_response = second_client.get("/api/config")

    assert post_response.status_code == 200
    assert get_response.status_code == 200
    assert get_response.json()["text_language"] == "en"
    assert get_response.json()["gemini"]["has_api_key"] is True
    assert get_response.json()["gemini"]["api_key_source"] == "stored"


def test_delete_api_key_clears_only_the_stored_value(tmp_path: Path, monkeypatch) -> None:
    client = TestClient(create_app(tmp_path))
    client.post("/api/config", json=make_payload())
    monkeypatch.setenv("GEMINI_API_KEY", "env-gemini")

    response = client.delete("/api/config/api-key")

    assert response.status_code == 200
    assert response.json()["gemini"]["has_api_key"] is True
    assert response.json()["gemini"]["api_key_source"] == "env"
```

- [ ] **Step 2: Run the config API tests to verify they fail**

Run: `uv run pytest tests/test_config_api.py -v`
Expected: FAIL with `assert 404 == 200` for `GET /api/config`.

- [ ] **Step 3: Write the config API router and wire it into the app factory**

Create `src/sayclearly/config_api.py` with:

```python
from pathlib import Path

from fastapi import APIRouter, HTTPException

from sayclearly.config_models import ConfigUpdatePayload, PublicConfigView
from sayclearly.config_service import ConfigService
from sayclearly.storage import StorageError


def build_config_router(data_root: Path | None = None) -> APIRouter:
    service = ConfigService(data_root)
    router = APIRouter()

    @router.get("/api/config", response_model=PublicConfigView)
    def get_config() -> PublicConfigView:
        try:
            return service.get_public_config()
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.post("/api/config", response_model=PublicConfigView)
    def update_config(payload: ConfigUpdatePayload) -> PublicConfigView:
        try:
            return service.update_config(payload)
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.delete("/api/config/api-key", response_model=PublicConfigView)
    def clear_api_key() -> PublicConfigView:
        try:
            return service.clear_stored_gemini_api_key()
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
```

Replace `src/sayclearly/app.py` with:

```python
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from sayclearly.config_api import build_config_router

PACKAGE_ROOT = Path(__file__).resolve().parent
TEMPLATES_DIR = PACKAGE_ROOT / "templates"
STATIC_DIR = PACKAGE_ROOT / "static"


def create_app(data_root: Path | None = None) -> FastAPI:
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    app = FastAPI(
        title="SayClearly",
    )

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.include_router(build_config_router(data_root))

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

- [ ] **Step 4: Run the config API tests to verify they pass**

Run: `uv run pytest tests/test_config_api.py -v`
Expected: PASS with 3 passed tests.

- [ ] **Step 5: Commit the config API wiring**

```bash
git add src/sayclearly/config_api.py src/sayclearly/app.py tests/test_config_api.py
git commit -m "feat: expose config storage API"
```

### Task 5: Add History API Routes And Final Storage Verification

**Files:**
- Create: `src/sayclearly/history_api.py`
- Modify: `src/sayclearly/app.py`
- Create: `tests/test_history_api.py`
- Test: `tests/test_history_api.py`

- [ ] **Step 1: Write the failing history API tests**

Create `tests/test_history_api.py` with:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from sayclearly.app import create_app


def make_session(session_id: str) -> dict[str, object]:
    return {
        "id": session_id,
        "created_at": f"2026-04-20T10:00:{session_id}",
        "language": "uk",
        "topic_prompt": "interesting facts",
        "text": f"Generated text {session_id}",
        "analysis": {
            "clarity_score": 7,
            "pace_score": 6,
            "hesitations": [],
            "summary": [f"Summary {session_id}"],
        },
    }


def test_post_history_and_list_sessions_newest_first(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    first = client.post("/api/history", json=make_session("01"))
    second = client.post("/api/history", json=make_session("02"))
    listing = client.get("/api/history")

    assert first.status_code == 200
    assert second.status_code == 200
    assert listing.status_code == 200
    assert [session["id"] for session in listing.json()["sessions"]] == ["02", "01"]


def test_get_history_session_returns_one_session(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    client.post("/api/history", json=make_session("01"))

    response = client.get("/api/history/01")

    assert response.status_code == 200
    assert response.json()["id"] == "01"


def test_get_history_session_returns_404_for_missing_id(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.get("/api/history/missing")

    assert response.status_code == 404
    assert response.json() == {"detail": "History session not found: missing"}
```

- [ ] **Step 2: Run the history API tests to verify they fail**

Run: `uv run pytest tests/test_history_api.py -v`
Expected: FAIL with `assert 404 == 200` for `POST /api/history`.

- [ ] **Step 3: Write the history API router and include it in the app factory**

Create `src/sayclearly/history_api.py` with:

```python
from pathlib import Path

from fastapi import APIRouter, HTTPException

from sayclearly.history_service import HistoryService, HistorySessionNotFoundError
from sayclearly.storage import StorageError
from sayclearly.storage_models import HistorySession, HistoryStore


def build_history_router(data_root: Path | None = None) -> APIRouter:
    service = HistoryService(data_root)
    router = APIRouter()

    @router.get("/api/history", response_model=HistoryStore)
    def get_history() -> HistoryStore:
        try:
            return service.list_history()
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get("/api/history/{session_id}", response_model=HistorySession)
    def get_history_session(session_id: str) -> HistorySession:
        try:
            return service.get_session(session_id)
        except HistorySessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"History session not found: {exc}") from exc
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.post("/api/history", response_model=HistoryStore)
    def save_history_session(session: HistorySession) -> HistoryStore:
        try:
            return service.save_session(session)
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
```

Replace `src/sayclearly/app.py` with:

```python
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from sayclearly.config_api import build_config_router
from sayclearly.history_api import build_history_router

PACKAGE_ROOT = Path(__file__).resolve().parent
TEMPLATES_DIR = PACKAGE_ROOT / "templates"
STATIC_DIR = PACKAGE_ROOT / "static"


def create_app(data_root: Path | None = None) -> FastAPI:
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    app = FastAPI(
        title="SayClearly",
    )

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

- [ ] **Step 4: Run the history API tests to verify they pass**

Run: `uv run pytest tests/test_history_api.py -v`
Expected: PASS with 3 passed tests.

- [ ] **Step 5: Run the full verification suite and commit the completed stage**

Run: `uv run pytest`
Expected: PASS with the existing smoke tests plus the new storage, service, and API tests all green.

Run: `uv run ruff check .`
Expected: PASS with no lint errors.

Run: `uv run ruff format --check .`
Expected: PASS with no formatting changes needed.

```bash
git add src/sayclearly/history_api.py src/sayclearly/app.py tests/test_history_api.py tests/test_storage.py tests/test_config_service.py tests/test_history_service.py tests/test_config_api.py
git commit -m "feat: add local config and history storage APIs"
```

## Self-Review Checklist

- Spec coverage: storage root creation, versioned JSON files, atomic writes, env overrides, secret status fields, history trimming, config/history APIs, and pragmatic tests all map to explicit tasks above.
- Placeholder scan: no `TBD`, `TODO`, or implicit "write tests later" steps remain.
- Type consistency: `StoredConfig`, `StoredSecrets`, `HistoryStore`, `HistorySession`, `ConfigUpdatePayload`, and `PublicConfigView` use the same field names across storage, services, and routes.
