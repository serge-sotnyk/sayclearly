# Convert `GeminiModelCatalogEntry` from TypedDict to Pydantic BaseModel

## Context

`src/sayclearly/gemini/catalog.py` uses a `TypedDict` for `GeminiModelCatalogEntry`. It is the only `TypedDict` in the project against 24 `BaseModel` definitions. This inconsistency drags two extra issues with it:
- data is accessed via `entry["id"]` instead of attribute access;
- in `GeminiPublicConfig.available_models` (config/models.py:92) the type is widened to `list[dict[str, str | int | None]]` — the catalog structure is lost at the public API boundary.

Goal: align the catalog with the project's dominant pattern (Pydantic BaseModel) and restore precise typing for `available_models`. `Literal` (ThinkingLevel, ConfigSource, version discriminators) is **left untouched** — it is used uniformly in three places, and switching to `StrEnum` would not provide useful value right now.

The JSON shape sent to the frontend does not change. The mirror `interface GeminiModelCatalogEntry` in `src/sayclearly/static/app_state.ts` already behaves as a structural type with attribute access, so no frontend changes are needed.

## Changes

### 1. `src/sayclearly/gemini/catalog.py`

- Remove `from typing import Literal, TypedDict`, replace with `from typing import Literal` and add `from pydantic import BaseModel, ConfigDict`.
- `class GeminiModelCatalogEntry(TypedDict)` → `class GeminiModelCatalogEntry(BaseModel)` with `model_config = ConfigDict(extra="forbid", frozen=True)` (frozen — because catalog entries are immutable).
- Rebuild `SUPPORTED_GEMINI_MODELS: tuple[GeminiModelCatalogEntry, ...]` as a tuple of instances: `GeminiModelCatalogEntry(id="...", label="...", free_tier_requests_per_day_hint=...)`.
- In `get_supported_gemini_models()` replace `entry.copy()` with `entry.model_copy()`.
- In `is_supported_gemini_model()` replace `entry["id"]` with `entry.id`.

### 2. `src/sayclearly/config/models.py:92`

- Import `GeminiModelCatalogEntry` from `sayclearly.gemini.catalog`.
- Narrow the type: `available_models: list[dict[str, str | int | None]]` → `available_models: list[GeminiModelCatalogEntry]`.

### 3. `src/sayclearly/config/service.py`

- No changes required: `get_public_config()` already passes the result of `get_supported_gemini_models()` directly into the `available_models` field. Pydantic accepts `list[GeminiModelCatalogEntry]` without any transformation.

### 4. `tests/test_gemini_catalog.py:12-17`

- Replace dict-literal comparison with `.model_dump()`:

```python
first_supported_model = get_supported_gemini_models()[0]
assert first_supported_model.model_dump() == {
    "id": "gemini-3-flash-preview",
    "label": "Gemini 3 Flash",
    "free_tier_requests_per_day_hint": 20,
}
```

### 5. `tests/test_config_service.py:210`

- Replace bracket access with attribute access: `public.gemini.available_models[0]["id"]` → `public.gemini.available_models[0].id`.

## Why these specific decisions

- **Tuple stays as `tuple[GeminiModelCatalogEntry, ...]`**: the syntax is modern (PEP 585), and for an immutable catalog a tuple is semantically more precise than a list. Once TypedDict is replaced with BaseModel the "old smell" disappears — it came from dict-style access, not from the tuple itself.
- **`frozen=True`**: the catalog is static module data; there is no reason to mutate entries, and `frozen` makes that contractual.
- **`extra="forbid"`**: matches the rest of the BaseModel definitions in the project.
- **JSON serialization**: FastAPI / Pydantic serialize a BaseModel into a dict of identical shape — the frontend will not notice.

## Verification

```bash
# Backend
uv run ruff check .
uv run ruff format --check .
uv run pytest

# Frontend (sanity check — should not break)
npm run test:frontend
```

Optional manual check: run `uv run sayclearly`, open Settings, verify the model list is visible in the `text-model` and `analysis-model` selectors. This exercises the catalog serialization path through `/api/config` to the frontend.

## Files modified

1. `src/sayclearly/gemini/catalog.py`
2. `src/sayclearly/config/models.py`
3. `tests/test_gemini_catalog.py`
4. `tests/test_config_service.py`
