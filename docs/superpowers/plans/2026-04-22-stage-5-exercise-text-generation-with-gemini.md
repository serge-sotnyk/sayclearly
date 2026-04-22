# Stage 5 Exercise Text Generation With Gemini Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder exercise generator with real Gemini-backed text generation, add model-selection settings that Stage 6 can reuse, and support local `.env`-based development defaults without breaking existing saved config.

**Architecture:** Expand the persisted Gemini config from one model field into a Stage 5 settings shape with text model, analysis model, same-model toggle, and thinking level. Add a narrow `sayclearly.gemini` backend boundary for the Google Gen AI SDK, structured JSON output, and optional Langfuse tracing, while keeping `exercise.service` responsible for topic resolution, recent-history context, normalization, and user-facing error mapping. Preserve the current frontend flow and teach the setup/settings UI to edit the expanded Gemini config and render the supported model catalog.

**Tech Stack:** Python 3.13+, FastAPI, Pydantic, google-genai, langfuse, python-dotenv, pytest, Ruff, TypeScript compiler, Node built-in test runner

---

## File Structure

- Modify: `pyproject.toml` - add `google-genai`, `langfuse`, and `python-dotenv` runtime dependencies.
- Modify: `src/sayclearly/main.py` - load the project-root `.env` before app creation without overriding existing environment variables.
- Create: `src/sayclearly/gemini/__init__.py` - empty package marker.
- Create: `src/sayclearly/gemini/catalog.py` - static catalog of supported Gemini models plus default-model helpers.
- Create: `src/sayclearly/gemini/client.py` - Google Gen AI SDK wrapper for structured text generation.
- Create: `src/sayclearly/gemini/telemetry.py` - optional Langfuse tracing helper with a no-op fallback.
- Modify: `src/sayclearly/storage/models.py` - Stage 5 Gemini config schema and persisted config version bump.
- Modify: `src/sayclearly/storage/files.py` - migrate legacy Stage 4 config payloads into the Stage 5 schema and write back migrated config.
- Modify: `src/sayclearly/config/models.py` - public and update models for expanded Gemini config plus catalog metadata.
- Modify: `src/sayclearly/config/service.py` - effective config assembly, model catalog exposure, and default-model resolution.
- Modify: `src/sayclearly/exercise/models.py` - typed generation models and normalized structured response schema.
- Create: `src/sayclearly/exercise/prompts.py` - system instruction and user-prompt builders for exercise generation.
- Modify: `src/sayclearly/exercise/service.py` - replace placeholder generation with Gemini orchestration and validation.
- Modify: `src/sayclearly/exercise/api.py` - map missing-key and provider failures into calm API responses.
- Modify: `src/sayclearly/templates/index.html` - add model selectors, thinking-level control, and same-model toggle hooks.
- Modify: `src/sayclearly/static/styles.css` - style the new setup/settings controls and compact model metadata.
- Modify: `src/sayclearly/static/app_state.ts` - expand config and form state for Gemini settings.
- Modify: `src/sayclearly/static/app.ts` - render the model catalog, save expanded config, and preserve inline generation errors.
- Modify: `src/sayclearly/static/dist/app_state.js` - committed compiled output of `app_state.ts`.
- Modify: `src/sayclearly/static/dist/app.js` - committed compiled output of `app.ts`.
- Add: `.env.example` - untracked developer example for Gemini and Langfuse environment variables.
- Modify: `tests/test_storage.py` - config migration and Stage 5 default-shape coverage.
- Modify: `tests/test_config_service.py` - expanded public config, env-default, and catalog coverage.
- Modify: `tests/test_config_api.py` - API contract coverage for the expanded Gemini shape.
- Modify: `tests/test_smoke.py` - startup coverage for `.env` loading.
- Create: `tests/test_exercise_prompts.py` - prompt-builder coverage.
- Create: `tests/test_gemini_client.py` - structured Gemini client coverage.
- Modify: `tests/test_exercise_service.py` - service orchestration and normalization coverage.
- Modify: `tests/test_exercise_api.py` - missing-key, provider-failure, and success-path coverage.
- Modify: `tests/test_stage_3_flow_integration.py` - update the stale placeholder assertions to Stage 5 generation expectations.
- Modify: `tests/test_app_shell.py` - shell hooks for the new settings controls.
- Modify: `frontend-tests/app_state.test.js` - frontend state transitions and payload-building coverage for expanded Gemini settings.
- Modify: `frontend-tests/app.test.js` - frontend rendering and same-model toggle behavior.

### Task 1: Expand Config, Catalog, Migration, And `.env` Startup

**Files:**
- Modify: `pyproject.toml`
- Modify: `src/sayclearly/main.py`
- Create: `src/sayclearly/gemini/__init__.py`
- Create: `src/sayclearly/gemini/catalog.py`
- Modify: `src/sayclearly/storage/models.py`
- Modify: `src/sayclearly/storage/files.py`
- Modify: `src/sayclearly/config/models.py`
- Modify: `src/sayclearly/config/service.py`
- Modify: `tests/test_storage.py`
- Modify: `tests/test_config_service.py`
- Modify: `tests/test_config_api.py`
- Modify: `tests/test_smoke.py`
- Test: `tests/test_storage.py`
- Test: `tests/test_config_service.py`
- Test: `tests/test_config_api.py`
- Test: `tests/test_smoke.py`

- [ ] **Step 1: Verify exact Gemini model IDs before writing the catalog**

Run:

```bash
npx ctx7@latest docs /googleapis/python-genai "exact Gemini Python SDK model IDs for gemini-3-flash and gemini-3.1-flash-lite-preview"
```

Expected: the docs or SDK examples confirm the exact model strings to store in `src/sayclearly/gemini/catalog.py`; use the documented identifiers, not visual names from AI Studio tables.

- [ ] **Step 2: Write the failing config and startup tests**

Add these tests to `tests/test_storage.py`:

```python
def test_load_config_migrates_stage_4_gemini_shape_to_stage_5_schema(tmp_path: Path) -> None:
    load_config(tmp_path)
    (tmp_path / "config.json").write_text(
        json.dumps(
            {
                "version": 1,
                "text_language": "uk",
                "analysis_language": "uk",
                "ui_language": "en",
                "same_language_for_analysis": True,
                "last_topic_prompt": "",
                "session_limit": 300,
                "keep_last_audio": False,
                "gemini": {"model": "gemini-2.5-flash"},
                "langfuse": {},
            }
        ),
        encoding="utf-8",
    )

    config = load_config(tmp_path)

    assert config.version == 2
    assert config.gemini.text_model == "gemini-2.5-flash"
    assert config.gemini.analysis_model == "gemini-2.5-flash"
    assert config.gemini.same_model_for_analysis is True
    assert config.gemini.text_thinking_level == "high"


def test_load_config_creates_stage_5_gemini_defaults(tmp_path: Path) -> None:
    config = load_config(tmp_path)

    assert config.version == 2
    assert config.gemini.text_model == "gemini-3-flash"
    assert config.gemini.analysis_model == "gemini-3-flash"
    assert config.gemini.same_model_for_analysis is True
    assert config.gemini.text_thinking_level == "high"
```

Add these tests to `tests/test_config_service.py`:

```python
def make_payload(**overrides: object) -> ConfigUpdatePayload:
    payload = {
        "text_language": "en",
        "analysis_language": "uk",
        "same_language_for_analysis": False,
        "ui_language": "en",
        "last_topic_prompt": "interesting facts about astronomy",
        "session_limit": 123,
        "keep_last_audio": True,
        "gemini": {
            "text_model": "gemini-3.1-flash-lite-preview",
            "analysis_model": "gemini-3.1-flash-lite-preview",
            "same_model_for_analysis": True,
            "text_thinking_level": "high",
            "api_key": "stored-gemini",
        },
        "langfuse": {
            "host": "https://langfuse.example",
            "public_key": "stored-public",
            "secret_key": "stored-secret",
        },
    }
    payload.update(overrides)
    return ConfigUpdatePayload.model_validate(payload)


def test_get_public_config_exposes_stage_5_gemini_fields_and_model_catalog(
    tmp_path: Path,
) -> None:
    service = ConfigService(tmp_path)

    public = service.get_public_config()

    assert public.gemini.text_model == "gemini-3-flash"
    assert public.gemini.analysis_model == "gemini-3-flash"
    assert public.gemini.same_model_for_analysis is True
    assert public.gemini.text_thinking_level == "high"
    assert any(option.id == public.gemini.text_model for option in public.gemini.available_models)


def test_get_public_config_uses_env_default_models_for_new_stage_5_config(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SAYCLEARLY_DEFAULT_TEXT_MODEL", "gemini-3.1-flash-lite-preview")
    monkeypatch.setenv("SAYCLEARLY_DEFAULT_ANALYSIS_MODEL", "gemini-3.1-flash-lite-preview")

    public = ConfigService(tmp_path).get_public_config()

    assert public.gemini.text_model == "gemini-3.1-flash-lite-preview"
    assert public.gemini.analysis_model == "gemini-3.1-flash-lite-preview"
```

Add this test to `tests/test_config_api.py`:

```python
def test_post_config_persists_expanded_gemini_shape(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/config",
        json={
            "text_language": "en",
            "analysis_language": "uk",
            "same_language_for_analysis": False,
            "ui_language": "en",
            "last_topic_prompt": "interesting facts about astronomy",
            "session_limit": 250,
            "keep_last_audio": False,
            "gemini": {
                "text_model": "gemini-3.1-flash-lite-preview",
                "analysis_model": "gemini-3.1-flash-lite-preview",
                "same_model_for_analysis": True,
                "text_thinking_level": "high",
                "api_key": "stored-gemini",
            },
            "langfuse": {
                "host": "https://langfuse.example",
                "public_key": "stored-public",
                "secret_key": "stored-secret",
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["gemini"]["text_model"] == "gemini-3.1-flash-lite-preview"
    assert response.json()["gemini"]["same_model_for_analysis"] is True
```

Add this test to `tests/test_smoke.py`:

```python
def test_main_loads_dotenv_before_creating_app(monkeypatch) -> None:
    call_order: list[str] = []

    def fake_load_dotenv() -> bool:
        call_order.append("dotenv")
        return True

    def fake_create_app() -> FastAPI:
        call_order.append("create_app")
        return FastAPI()

    def fake_run(app: object, host: str, port: int) -> None:
        call_order.append("run")

    monkeypatch.setattr(main_module, "load_dotenv", fake_load_dotenv)
    monkeypatch.setattr(main_module, "create_app", fake_create_app)
    monkeypatch.setattr(main_module.uvicorn, "run", fake_run)

    main_module.main()

    assert call_order[:2] == ["dotenv", "create_app"]
```

- [ ] **Step 3: Run the focused config tests to watch them fail**

Run:

```bash
uv run pytest tests/test_storage.py::test_load_config_migrates_stage_4_gemini_shape_to_stage_5_schema tests/test_storage.py::test_load_config_creates_stage_5_gemini_defaults tests/test_config_service.py::test_get_public_config_exposes_stage_5_gemini_fields_and_model_catalog tests/test_config_service.py::test_get_public_config_uses_env_default_models_for_new_stage_5_config tests/test_config_api.py::test_post_config_persists_expanded_gemini_shape tests/test_smoke.py::test_main_loads_dotenv_before_creating_app -q
```

Expected: FAIL because the current config schema only exposes `gemini.model`, there is no Stage 5 catalog, and `main.py` does not call `load_dotenv()`.

- [ ] **Step 4: Implement the minimal config, migration, catalog, and startup support**

Update `pyproject.toml` dependencies to:

```toml
dependencies = [
    "fastapi>=0.115.12",
    "google-genai>=1.33.0",
    "jinja2>=3.1.6",
    "langfuse>=3.5.1",
    "pydantic>=2.11.9",
    "python-dotenv>=1.1.1",
    "python-multipart>=0.0.20",
    "uvicorn>=0.35.0",
]
```

Create `src/sayclearly/gemini/catalog.py` with the static catalog and default helpers:

```python
from pydantic import BaseModel, ConfigDict


class GeminiModelCatalogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    free_tier_rpd: int | None = None


PRODUCT_DEFAULT_TEXT_MODEL = "gemini-3-flash"
DEV_DEFAULT_TEXT_MODEL = "gemini-3.1-flash-lite-preview"

SUPPORTED_GEMINI_MODELS = [
    GeminiModelCatalogEntry(id="gemini-2.5-flash", label="Gemini 2.5 Flash", free_tier_rpd=20),
    GeminiModelCatalogEntry(id="gemini-2.5-pro", label="Gemini 2.5 Pro", free_tier_rpd=None),
    GeminiModelCatalogEntry(id="gemini-2-flash", label="Gemini 2 Flash", free_tier_rpd=None),
    GeminiModelCatalogEntry(id="gemini-2-flash-lite", label="Gemini 2 Flash Lite", free_tier_rpd=None),
    GeminiModelCatalogEntry(id="gemini-3-flash", label="Gemini 3 Flash", free_tier_rpd=20),
    GeminiModelCatalogEntry(id="gemini-3.1-flash-lite-preview", label="Gemini 3.1 Flash Lite Preview", free_tier_rpd=500),
    GeminiModelCatalogEntry(id="gemini-3.1-pro", label="Gemini 3.1 Pro", free_tier_rpd=None),
    GeminiModelCatalogEntry(id="gemini-2.5-flash-lite", label="Gemini 2.5 Flash Lite", free_tier_rpd=20),
]
```

Update `src/sayclearly/storage/models.py` to a migrated Stage 5 config shape:

```python
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


GeminiThinkingLevel = Literal["minimal", "low", "medium", "high"]


class GeminiConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text_model: str = "gemini-3-flash"
    analysis_model: str = "gemini-3-flash"
    same_model_for_analysis: bool = True
    text_thinking_level: GeminiThinkingLevel = "high"


class StoredConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[2] = 2
    text_language: str = "uk"
    analysis_language: str = "uk"
    ui_language: str = "en"
    same_language_for_analysis: bool = True
    last_topic_prompt: str = ""
    session_limit: int = Field(default=300, gt=0)
    keep_last_audio: bool = False
    gemini: GeminiConfig = Field(default_factory=GeminiConfig)
    langfuse: LangfuseConfig = Field(default_factory=LangfuseConfig)
```

Add a legacy-config migration helper in `src/sayclearly/storage/files.py`:

```python
def _migrate_config_payload(payload: dict[str, object], default_config: StoredConfig) -> dict[str, object]:
    if payload.get("version") != 1:
        return payload

    migrated = dict(payload)
    legacy_gemini = dict(migrated.get("gemini") or {})
    legacy_model = str(legacy_gemini.get("model") or default_config.gemini.text_model)
    migrated["version"] = 2
    migrated["gemini"] = {
        "text_model": legacy_model,
        "analysis_model": legacy_model,
        "same_model_for_analysis": True,
        "text_thinking_level": "high",
    }
    return migrated
```

Update `src/sayclearly/config/models.py` so the API exposes the Stage 5 Gemini shape:

```python
class GeminiConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text_model: NonEmptyString
    analysis_model: NonEmptyString
    same_model_for_analysis: bool
    text_thinking_level: Literal["minimal", "low", "medium", "high"]
    api_key: NonEmptyString | None = None


class GeminiModelOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    free_tier_rpd: int | None = None


class GeminiPublicConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text_model: str
    analysis_model: str
    same_model_for_analysis: bool
    text_thinking_level: str
    available_models: list[GeminiModelOption]
    has_api_key: bool
    api_key_source: ConfigSource
```

Update `src/sayclearly/config/service.py` to use the new defaults and catalog:

```python
from sayclearly.gemini.catalog import DEV_DEFAULT_TEXT_MODEL, PRODUCT_DEFAULT_TEXT_MODEL, SUPPORTED_GEMINI_MODELS


def _build_default_config(self) -> StoredConfig:
    return StoredConfig(
        gemini=GeminiConfig(
            text_model=self._default_text_model(),
            analysis_model=self._default_analysis_model(),
            same_model_for_analysis=True,
            text_thinking_level="high",
        )
    )


def _default_text_model(self) -> str:
    env_value = self._get_env_override("SAYCLEARLY_DEFAULT_TEXT_MODEL")
    if env_value:
        return env_value
    return PRODUCT_DEFAULT_TEXT_MODEL


def _default_analysis_model(self) -> str:
    env_value = self._get_env_override("SAYCLEARLY_DEFAULT_ANALYSIS_MODEL")
    if env_value:
        return env_value
    return self._default_text_model()
```

Update `src/sayclearly/storage/files.py` so config loading uses the injected Stage 5 defaults and writes migrated config back to disk:

```python
def load_config(
    data_root: Path | None = None,
    *,
    default_config: StoredConfig | None = None,
) -> StoredConfig:
    root = ensure_storage_root(data_root)
    configured_default = default_config or StoredConfig()
    path = root / CONFIG_FILE_NAME

    if not path.exists():
        atomic_write_json(path, configured_default.model_dump(mode="json", exclude_none=True))
        return configured_default

    payload = json.loads(path.read_text(encoding="utf-8"))
    migrated_payload = _migrate_config_payload(payload, configured_default)
    config = StoredConfig.model_validate(migrated_payload)
    if migrated_payload != payload:
        atomic_write_json(path, config.model_dump(mode="json", exclude_none=True))
    return config
```

Update `src/sayclearly/main.py` so startup loads `.env` first:

```python
import logging
import webbrowser

import uvicorn
from dotenv import load_dotenv

from sayclearly.app import create_app


def main() -> None:
    load_dotenv()
    app = create_app()
    url = f"http://{HOST}:{PORT}/"
```

- [ ] **Step 5: Run the focused config tests to verify they pass**

Run:

```bash
uv run pytest tests/test_storage.py::test_load_config_migrates_stage_4_gemini_shape_to_stage_5_schema tests/test_storage.py::test_load_config_creates_stage_5_gemini_defaults tests/test_config_service.py::test_get_public_config_exposes_stage_5_gemini_fields_and_model_catalog tests/test_config_service.py::test_get_public_config_uses_env_default_models_for_new_stage_5_config tests/test_config_api.py::test_post_config_persists_expanded_gemini_shape tests/test_smoke.py::test_main_loads_dotenv_before_creating_app -q
```

Expected: PASS.

- [ ] **Step 6: Commit the config and startup foundation**

Run:

```bash
git add pyproject.toml src/sayclearly/main.py src/sayclearly/gemini/__init__.py src/sayclearly/gemini/catalog.py src/sayclearly/storage/models.py src/sayclearly/storage/files.py src/sayclearly/config/models.py src/sayclearly/config/service.py tests/test_storage.py tests/test_config_service.py tests/test_config_api.py tests/test_smoke.py
git commit -m "feat: add Gemini config defaults and catalog"
```

### Task 2: Add Gemini Client, Prompts, Telemetry, And Backend Generation

**Files:**
- Create: `src/sayclearly/gemini/client.py`
- Create: `src/sayclearly/gemini/telemetry.py`
- Modify: `src/sayclearly/exercise/models.py`
- Create: `src/sayclearly/exercise/prompts.py`
- Modify: `src/sayclearly/exercise/service.py`
- Modify: `src/sayclearly/exercise/api.py`
- Create: `tests/test_exercise_prompts.py`
- Create: `tests/test_gemini_client.py`
- Modify: `tests/test_exercise_service.py`
- Modify: `tests/test_exercise_api.py`
- Modify: `tests/test_stage_3_flow_integration.py`
- Test: `tests/test_exercise_prompts.py`
- Test: `tests/test_gemini_client.py`
- Test: `tests/test_exercise_service.py`
- Test: `tests/test_exercise_api.py`
- Test: `tests/test_stage_3_flow_integration.py`

- [ ] **Step 1: Write the failing prompt, client, service, and API tests**

Create `tests/test_exercise_prompts.py` with:

```python
from sayclearly.exercise.prompts import build_generation_prompt, build_generation_system_instruction


def test_build_generation_prompt_includes_language_topic_and_recent_texts() -> None:
    prompt = build_generation_prompt(
        language="en",
        topic_prompt="quiet mountain mornings",
        recent_texts=[
            "A prior exercise about a crowded train platform.",
            "Another exercise about ordering coffee before work.",
        ],
    )

    assert "en" in prompt
    assert "quiet mountain mornings" in prompt
    assert "crowded train platform" in prompt
    assert "ordering coffee before work" in prompt
    assert "5-8 sentences" in prompt


def test_build_generation_system_instruction_requires_structured_json() -> None:
    instruction = build_generation_system_instruction()

    assert "JSON" in instruction
    assert "reading aloud" in instruction
    assert "retelling" in instruction
```

Create `tests/test_gemini_client.py` with:

```python
from types import SimpleNamespace

import pytest

from sayclearly.gemini.client import GeminiExerciseClient, MissingGeminiApiKeyError


def test_generate_exercise_raises_when_api_key_is_missing() -> None:
    with pytest.raises(MissingGeminiApiKeyError, match="Gemini API key"):
        GeminiExerciseClient(api_key=None).generate_exercise(
            model_id="gemini-3.1-flash-lite-preview",
            system_instruction="Write JSON",
            prompt="Generate a short exercise",
            thinking_level="high",
        )


def test_generate_exercise_parses_structured_json(monkeypatch) -> None:
    captured = {}

    class FakeModels:
        def generate_content(self, *, model, contents, config):
            captured["model"] = model
            captured["contents"] = contents
            captured["config"] = config
            return SimpleNamespace(text='{"text":"Sentence one. Sentence two.","topic_prompt":"coffee"}')

    fake_sdk_client = SimpleNamespace(models=FakeModels())
    client = GeminiExerciseClient(api_key="test-key", sdk_client=fake_sdk_client)

    result = client.generate_exercise(
        model_id="gemini-3.1-flash-lite-preview",
        system_instruction="Write JSON",
        prompt="Generate a short exercise",
        thinking_level="high",
    )

    assert result.text == "Sentence one. Sentence two."
    assert result.topic_prompt == "coffee"
    assert captured["model"] == "gemini-3.1-flash-lite-preview"
```

Update `tests/test_exercise_service.py` with:

```python
def test_generate_text_uses_saved_topic_and_recent_history_context(tmp_path: Path) -> None:
    config = load_config(tmp_path)
    save_config(
        tmp_path,
        config.model_copy(update={"last_topic_prompt": "quiet forest mornings"}),
    )
    save_history(
        tmp_path,
        HistoryStore(
            sessions=[
                HistorySession(
                    id="session-1",
                    created_at="2026-04-21T10:00:00Z",
                    language="en",
                    topic_prompt="busy market squares",
                    text="A prior exercise about a busy market square.",
                    analysis=SessionAnalysis(clarity_score=70, pace_score=70, summary=[]),
                )
            ]
        ),
    )

    captured = {}

    class FakeGenerator:
        def generate_exercise(self, **kwargs):
            captured.update(kwargs)
            return StructuredExerciseResponse(
                text="A fresh exercise about trees and bird song.",
                topic_prompt="quiet forest mornings",
            )

    service = ExerciseService(tmp_path, generator=FakeGenerator())
    response = service.generate_text(
        ExerciseGenerationRequest(
            language="en",
            analysis_language="uk",
            topic_prompt="",
            reuse_last_topic=True,
        )
    )

    assert response.topic_prompt == "quiet forest mornings"
    assert "busy market square" in captured["recent_texts"][0]
```

Update `tests/test_exercise_api.py` with:

```python
def test_post_generate_text_returns_400_when_gemini_api_key_is_missing(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/generate-text",
        json={
            "language": "en",
            "analysis_language": "uk",
            "topic_prompt": "clear speech warmup",
            "reuse_last_topic": False,
        },
    )

    assert response.status_code == 400
    assert "Gemini API key" in response.json()["detail"]
```

Update `tests/test_stage_3_flow_integration.py` to replace the stale placeholder assertion with:

```python
monkeypatch.setenv("GEMINI_API_KEY", "test-key")

def fake_generate_exercise(self, *, model_id, system_instruction, prompt, thinking_level):
    return StructuredExerciseResponse(
        text="A fresh exercise about ordering coffee with calm, clear articulation.",
        topic_prompt="Order coffee before work",
    )

monkeypatch.setattr(
    "sayclearly.gemini.client.GeminiExerciseClient.generate_exercise",
    fake_generate_exercise,
)

assert "placeholder" not in generate_response.json()["text"].lower()
assert generate_response.json()["text"]
```

- [ ] **Step 2: Run the focused generation tests to watch them fail**

Run:

```bash
uv run pytest tests/test_exercise_prompts.py tests/test_gemini_client.py tests/test_exercise_service.py tests/test_exercise_api.py tests/test_stage_3_flow_integration.py -q
```

Expected: FAIL because there is no Gemini client, no prompt builder, `ExerciseService` still returns placeholder text, and the API does not distinguish missing-key failures.

- [ ] **Step 3: Implement the minimal Gemini generation backend**

Update `src/sayclearly/exercise/models.py` with the internal structured response model:

```python
from pydantic import BaseModel, ConfigDict


class StructuredExerciseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    topic_prompt: str = ""
```

Create `src/sayclearly/exercise/prompts.py` with:

```python
def build_generation_system_instruction() -> str:
    return (
        "You write short diction exercises for reading aloud. "
        "Return JSON only. Make the text calm, useful, and suitable for a later retelling. "
        "Avoid repeating recent exercises too closely."
    )


def build_generation_prompt(*, language: str, topic_prompt: str, recent_texts: list[str]) -> str:
    recent_block = "\n".join(f"- {text}" for text in recent_texts) if recent_texts else "- none"
    topic_line = topic_prompt or "Choose a fresh, practical topic."
    return (
        f"Write a speaking exercise in {language}.\n"
        f"Topic guidance: {topic_line}\n"
        "Target shape: 5-8 sentences, suitable for reading aloud and retelling.\n"
        "Recent exercises to avoid repeating too closely:\n"
        f"{recent_block}\n"
        "Return a JSON object with keys text and topic_prompt."
    )
```

Create `src/sayclearly/gemini/client.py` with:

```python
from google import genai
from google.genai import types

from sayclearly.exercise.models import StructuredExerciseResponse


class MissingGeminiApiKeyError(RuntimeError):
    pass


class GeminiGenerationError(RuntimeError):
    pass


class GeminiExerciseClient:
    def __init__(self, api_key: str | None, sdk_client: object | None = None) -> None:
        self.api_key = api_key
        self._sdk_client = sdk_client

    def generate_exercise(
        self,
        *,
        model_id: str,
        system_instruction: str,
        prompt: str,
        thinking_level: str,
    ) -> StructuredExerciseResponse:
        if not self.api_key:
            raise MissingGeminiApiKeyError("Gemini API key is required for exercise generation")

        client = self._sdk_client or genai.Client(api_key=self.api_key)
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=1,
                response_mime_type="application/json",
                response_json_schema=StructuredExerciseResponse,
                thinking_config=types.ThinkingConfig(thinking_level=thinking_level.upper()),
            ),
        )
        try:
            return StructuredExerciseResponse.model_validate_json(response.text)
        except Exception as exc:  # pragma: no cover
            raise GeminiGenerationError("Gemini returned an invalid exercise payload") from exc
```

Create `src/sayclearly/gemini/telemetry.py` with a no-op-safe Langfuse wrapper:

```python
from contextlib import nullcontext
import os

from langfuse import Langfuse


def start_generation_observation(*, model: str, prompt: str, thinking_level: str):
    if not (
        os.getenv("LANGFUSE_PUBLIC_KEY")
        and os.getenv("LANGFUSE_SECRET_KEY")
        and os.getenv("LANGFUSE_HOST")
    ):
        return nullcontext(None)

    langfuse = Langfuse(base_url=os.getenv("LANGFUSE_HOST"))
    return langfuse.start_as_current_observation(
        name="exercise-text-generation",
        as_type="generation",
        model=model,
        input={"prompt": prompt},
        model_parameters={"temperature": 1, "thinking_level": thinking_level},
    )
```

Update `src/sayclearly/exercise/service.py` so it orchestrates Gemini and recent-history context:

```python
from sayclearly.exercise.prompts import build_generation_prompt, build_generation_system_instruction
from sayclearly.gemini.client import GeminiExerciseClient, GeminiGenerationError, MissingGeminiApiKeyError
from sayclearly.storage.files import load_config, load_history, load_secrets


class ExerciseService:
    def __init__(self, data_root: Path | None = None, generator: object | None = None) -> None:
        self.data_root = data_root
        self.generator = generator

    def generate_text(self, request: ExerciseGenerationRequest) -> ExerciseGenerationResponse:
        config = load_config(self.data_root)
        secrets = load_secrets(self.data_root)
        topic_prompt = self._resolve_topic(request)
        recent_texts = [session.text for session in load_history(self.data_root).sessions[:3]]
        client = self.generator or GeminiExerciseClient(api_key=secrets.gemini.api_key)
        structured = client.generate_exercise(
            model_id=config.gemini.text_model,
            system_instruction=build_generation_system_instruction(),
            prompt=build_generation_prompt(
                language=request.language,
                topic_prompt=topic_prompt,
                recent_texts=recent_texts,
            ),
            thinking_level=config.gemini.text_thinking_level,
        )
        text = structured.text.strip()
        if not text or text.startswith("```"):
            raise GeminiGenerationError("Gemini returned an invalid exercise payload")
        return ExerciseGenerationResponse(
            language=request.language,
            analysis_language=request.analysis_language,
            topic_prompt=structured.topic_prompt or topic_prompt,
            text=text,
        )
```

Update `src/sayclearly/exercise/api.py` to map calm API errors:

```python
from sayclearly.gemini.client import GeminiGenerationError, MissingGeminiApiKeyError


@router.post("/api/generate-text", response_model=ExerciseGenerationResponse)
def generate_text(payload: ExerciseGenerationRequest) -> ExerciseGenerationResponse:
    try:
        return service.generate_text(payload)
    except MissingGeminiApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GeminiGenerationError as exc:
        raise HTTPException(status_code=502, detail="Could not generate an exercise right now.") from exc
    except StorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
```

- [ ] **Step 4: Run the focused generation tests to verify they pass**

Run:

```bash
uv run pytest tests/test_exercise_prompts.py tests/test_gemini_client.py tests/test_exercise_service.py tests/test_exercise_api.py tests/test_stage_3_flow_integration.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit the backend generation work**

Run:

```bash
git add src/sayclearly/gemini/client.py src/sayclearly/gemini/telemetry.py src/sayclearly/exercise/models.py src/sayclearly/exercise/prompts.py src/sayclearly/exercise/service.py src/sayclearly/exercise/api.py tests/test_exercise_prompts.py tests/test_gemini_client.py tests/test_exercise_service.py tests/test_exercise_api.py tests/test_stage_3_flow_integration.py
git commit -m "feat: add Gemini-backed exercise generation"
```

### Task 3: Wire The Expanded Gemini Settings Into The Frontend

**Files:**
- Modify: `src/sayclearly/templates/index.html`
- Modify: `src/sayclearly/static/styles.css`
- Modify: `src/sayclearly/static/app_state.ts`
- Modify: `src/sayclearly/static/app.ts`
- Modify: `src/sayclearly/static/dist/app_state.js`
- Modify: `src/sayclearly/static/dist/app.js`
- Modify: `tests/test_app_shell.py`
- Modify: `frontend-tests/app_state.test.js`
- Modify: `frontend-tests/app.test.js`
- Test: `tests/test_app_shell.py`
- Test: `frontend-tests/app_state.test.js`
- Test: `frontend-tests/app.test.js`

- [ ] **Step 1: Write the failing shell and frontend tests**

Update `tests/test_app_shell.py` with:

```python
def test_home_page_renders_stage_5_gemini_settings_hooks() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "data-text-model-select" in response.text
    assert "data-analysis-model-select" in response.text
    assert "data-same-model-toggle" in response.text
    assert "data-thinking-level-select" in response.text
```

Update `frontend-tests/app_state.test.js` with:

```javascript
test('buildConfigUpdatePayload keeps Gemini model settings in sync when same-model is enabled', () => {
  const settings = {
    text_language: 'pl',
    analysis_language: 'en',
    same_language_for_analysis: false,
    topic_prompt: 'Describe a quiet library',
    reuse_last_topic: false,
    text_model: 'gemini-3.1-flash-lite-preview',
    analysis_model: 'gemini-3-flash',
    same_model_for_analysis: true,
    text_thinking_level: 'high',
  };

  const payload = buildConfigUpdatePayload(publicConfig, settings);

  assert.equal(payload.gemini.text_model, 'gemini-3.1-flash-lite-preview');
  assert.equal(payload.gemini.analysis_model, 'gemini-3.1-flash-lite-preview');
  assert.equal(payload.gemini.same_model_for_analysis, true);
  assert.equal(payload.gemini.text_thinking_level, 'high');
});
```

Update `frontend-tests/app.test.js` with:

```javascript
test('startApp renders Gemini model settings and disables the analysis model when same-model is enabled', async () => {
  const shell = createShell();
  const config = createConfig({
    gemini: {
      text_model: 'gemini-3.1-flash-lite-preview',
      analysis_model: 'gemini-3-flash',
      same_model_for_analysis: true,
      text_thinking_level: 'high',
      available_models: [
        { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview', free_tier_rpd: 500 },
        { id: 'gemini-3-flash', label: 'Gemini 3 Flash', free_tier_rpd: 20 },
      ],
      has_api_key: true,
      api_key_source: 'stored',
    },
  });
  const { fetchStub } = createFetchStub(createResponse(config));

  await startApp(shell.document, fetchStub);

  assert.equal(shell.elements.get('[data-text-model-select]').value, 'gemini-3.1-flash-lite-preview');
  assert.equal(shell.elements.get('[data-analysis-model-select]').value, 'gemini-3-flash');
  assert.equal(shell.elements.get('[data-analysis-model-select]').disabled, true);
  assert.equal(shell.elements.get('[data-thinking-level-select]').value, 'high');
});
```

- [ ] **Step 2: Run the shell and frontend tests to watch them fail**

Run:

```bash
uv run pytest tests/test_app_shell.py -q && npm run test:frontend
```

Expected: FAIL because the shell has no Stage 5 selectors, the TypeScript state does not know about expanded Gemini config, and the frontend cannot render the model catalog.

- [ ] **Step 3: Implement the minimal Stage 5 frontend wiring**

Update `src/sayclearly/static/app_state.ts` so settings and config include the new Gemini fields:

```typescript
interface GeminiModelOption {
  id: string;
  label: string;
  free_tier_rpd: number | null;
}

interface GeminiPublicConfig {
  text_model: string;
  analysis_model: string;
  same_model_for_analysis: boolean;
  text_thinking_level: 'minimal' | 'low' | 'medium' | 'high';
  available_models: GeminiModelOption[];
  has_api_key: boolean;
  api_key_source: ConfigSource;
}

export interface SettingsFormState {
  text_language: string;
  analysis_language: string;
  same_language_for_analysis: boolean;
  topic_prompt: string;
  reuse_last_topic: boolean;
  text_model: string;
  analysis_model: string;
  same_model_for_analysis: boolean;
  text_thinking_level: 'minimal' | 'low' | 'medium' | 'high';
}
```

Update the config payload builder to keep model selection coherent:

```typescript
function syncGeminiModelSelection(settings: SettingsFormState): SettingsFormState {
  if (!settings.same_model_for_analysis) {
    return { ...settings };
  }

  return {
    ...settings,
    analysis_model: settings.text_model,
  };
}

export function buildConfigUpdatePayload(config: PublicConfig, settings: SettingsFormState) {
  const syncedSettings = syncGeminiModelSelection(syncAnalysisLanguage(settings));

  return {
    text_language: syncedSettings.text_language,
    analysis_language: syncedSettings.analysis_language,
    same_language_for_analysis: syncedSettings.same_language_for_analysis,
    ui_language: config.ui_language,
    last_topic_prompt: syncedSettings.topic_prompt,
    session_limit: config.session_limit,
    keep_last_audio: config.keep_last_audio,
    gemini: {
      text_model: syncedSettings.text_model,
      analysis_model: syncedSettings.analysis_model,
      same_model_for_analysis: syncedSettings.same_model_for_analysis,
      text_thinking_level: syncedSettings.text_thinking_level,
      api_key: null,
    },
    langfuse: {
      host: config.langfuse.host,
      public_key: null,
      secret_key: null,
    },
  };
}
```

Update `src/sayclearly/templates/index.html` to add the new controls:

```html
<label class="field">
  <span>Text generation model</span>
  <select data-text-model-select></select>
</label>

<label class="field">
  <span>Analysis model</span>
  <select data-analysis-model-select></select>
</label>

<label class="toggle-field">
  <input type="checkbox" checked data-same-model-toggle />
  <span>Use the same model for analysis</span>
</label>

<label class="field">
  <span>Thinking level</span>
  <select data-thinking-level-select>
    <option value="minimal">Minimal</option>
    <option value="low">Low</option>
    <option value="medium">Medium</option>
    <option value="high">High</option>
  </select>
</label>
```

Update `src/sayclearly/static/app.ts` to render the catalog and same-model behavior:

```typescript
function renderModelOptions(select: HTMLSelectElement, options: Array<{ id: string; label: string; free_tier_rpd: number | null }>, selectedId: string): void {
  select.innerHTML = '';
  for (const option of options) {
    const element = document.createElement('option');
    const rpdSuffix = option.free_tier_rpd === null ? '' : ` (free tier: ${option.free_tier_rpd} RPD)`;
    element.value = option.id;
    element.textContent = `${option.label}${rpdSuffix}`;
    element.selected = option.id === selectedId;
    select.appendChild(element);
  }
}
```

Build the compiled frontend assets:

```bash
npm run build:frontend
```

- [ ] **Step 4: Run the shell and frontend tests to verify they pass**

Run:

```bash
uv run pytest tests/test_app_shell.py -q && npm run test:frontend
```

Expected: PASS.

- [ ] **Step 5: Commit the frontend Stage 5 settings work**

Run:

```bash
git add src/sayclearly/templates/index.html src/sayclearly/static/styles.css src/sayclearly/static/app_state.ts src/sayclearly/static/app.ts src/sayclearly/static/dist/app_state.js src/sayclearly/static/dist/app.js tests/test_app_shell.py frontend-tests/app_state.test.js frontend-tests/app.test.js
git commit -m "feat: add Gemini model settings UI"
```

### Task 4: Add The Local `.env` Example And Run Full Verification

**Files:**
- Add: `.env.example`
- Test: `tests`
- Test: `frontend-tests`

- [ ] **Step 1: Add the local `.env` example file**

Create `.env.example` with:

```env
GEMINI_API_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=
SAYCLEARLY_DEFAULT_TEXT_MODEL=gemini-3.1-flash-lite-preview
SAYCLEARLY_DEFAULT_ANALYSIS_MODEL=gemini-3.1-flash-lite-preview
```

- [ ] **Step 2: Run the integration test to watch it fail if any placeholder behavior remains**

Run:

```bash
uv run pytest tests/test_stage_3_flow_integration.py::test_stage_3_happy_path_loads_config_saves_and_generates_text -q
```

Expected: FAIL if any code path still returns placeholder exercise text.

- [ ] **Step 3: Run the full project verification after the backend and frontend tasks are green**

Run:

```bash
uv run pytest
npm run test:frontend
uv run ruff check .
uv run ruff format --check .
```

Expected: all commands PASS with no placeholder-generation assertions left in the suite.

- [ ] **Step 4: Commit the final Stage 5 verification and env example**

Run:

```bash
git add .env.example tests/test_stage_3_flow_integration.py
git commit -m "docs: add local env defaults for Gemini"
```

## Self-Review

- Spec coverage: the plan covers config migration, `.env` loading, exact-model catalog wiring, Gemini text generation, optional Langfuse tracing, frontend settings, and verification commands from the Stage 5 spec.
- Placeholder scan: no `TODO`, `TBD`, or "add error handling later" steps remain.
- Type consistency: the plan uses the same Stage 5 Gemini fields across storage, API, frontend state, and tests: `text_model`, `analysis_model`, `same_model_for_analysis`, and `text_thinking_level`.
