# Code Review: Low-Hanging Fruit

## Context

The SayClearly project was largely written with automation. A code review revealed several simple improvements that would increase code quality without major refactoring.

---

## 1. Remove dead code: `_resolve_value()` in ConfigService

**File:** `src/sayclearly/config/service.py:149-160`

The method `_resolve_value()` is defined but never called (confirmed by grep across all of src/). Remove it.

---

## 2. Eliminate duplication of `_is_bad_request_validation_error()`

**Files:**
- `src/sayclearly/web/errors.py:21-28` — original
- `src/sayclearly/exercise/api.py:22-37` — copy + `BAD_REQUEST_VALIDATION_TYPES`

The function and `BAD_REQUEST_VALIDATION_TYPES` constant are duplicated. In `exercise/api.py`, import from `web/errors.py` instead of redefining.

---

## 3. Eliminate duplication of `_resolve_gemini_api_key()`

**Files:**
- `src/sayclearly/exercise/service.py:112-120`
- `src/sayclearly/recording/service.py:139-146`

Identical logic: check env `GEMINI_API_KEY`, then stored secrets. Extract into a shared function in `src/sayclearly/config/service.py` (where config logic already lives) and use it in both services.

---

## 4. Add logging to bare `except Exception` blocks

**Files:**
- `src/sayclearly/exercise/service.py:83-86`
- `src/sayclearly/recording/service.py:116-119`

Currently `except Exception as exc` catches everything and silently wraps it into a domain error. Add `logger.exception(...)` before re-raise so unexpected errors are not lost without a trace.

---

## 5. Add logging to silent except blocks in telemetry

**File:** `src/sayclearly/gemini/telemetry.py` (lines 28, 36, 48, 114, 136)

Five places where `except Exception: return` silently swallows errors. Add `logger.debug(...)` — telemetry should not crash the app, but hiding errors completely is not ideal either.

---

## 6. Synchronize language defaults in HTML template and TypeScript

**Files:**
- `src/sayclearly/templates/index.html:76,81` — `value="English"`
- `src/sayclearly/static/app_state.ts:189-190` — `text_language: 'uk'`

The template shows "English" as the initial value, but the TS default is `'uk'`. On load the server config overwrites the fields, but during loading (or on load failure) the user sees "English". Synchronize: set `'English'` in `app_state.ts` DEFAULT_CONFIG (or `'uk'` in the template — either way, they should match).

**Note:** this is mostly cosmetic — under normal operation the config loads from the server. But on load failure the mismatch would be visible.

---

## Out of scope (conscious choice)

- **Full UI re-rendering (28 `render()` calls)** — architectural decision, not low-hanging fruit
- **Accessibility (focus indicators, ARIA)** — important but a separate task
- **CI/CD pipeline** — separate initiative
- **Telemetry `object` typing** — works fine, minimal improvement
- **Adding ruff security rules** — separate decision

---

## Verification

```bash
uv run pytest                    # all tests pass
uv run ruff check .              # no new warnings
uv run ruff format --check .     # formatting OK
```

---

## Files to change

1. `src/sayclearly/config/service.py` — remove `_resolve_value()`, add `resolve_gemini_api_key()`
2. `src/sayclearly/exercise/api.py` — remove duplicate, import from `web/errors`
3. `src/sayclearly/exercise/service.py` — add logging in except, use shared `resolve_gemini_api_key`
4. `src/sayclearly/recording/service.py` — add logging in except, use shared `resolve_gemini_api_key`
5. `src/sayclearly/gemini/telemetry.py` — add `logger.debug` to silent except blocks
6. `src/sayclearly/templates/index.html` — synchronize language default
7. `src/sayclearly/static/app_state.ts` — synchronize language default (+ rebuild bundle)