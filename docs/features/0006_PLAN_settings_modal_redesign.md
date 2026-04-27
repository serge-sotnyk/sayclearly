# Settings UI redesign — gear button + modal

## Context

The current Settings UI has two visible problems on the home screen:

1. **The button is a circle.** It's a `.button-ghost` with `border-radius: 999px` and `min-height: 2.75rem`; with the short word "Settings" inside, the natural width happens to roughly match the height, producing an odd circular shape inside the hero card. It also sits in the middle of the hero, competing with the `SayClearly` title.
2. **The settings panel is a cramped 16rem sidebar** rendered as a sibling column in the flex `.shell-grid`. When opened, it appears next to the Setup card; text wraps awkwardly inside ~256px and feels like an afterthought rather than a real settings area. The MVP spec (§8 "Settings screen") describes settings as a separate screen with API-key status and a clear button — not as a co-located sidebar.

This iteration replaces both: a discreet gear icon in the top-right corner of the page, and a centered **modal** (reusing the existing `history-modal` pattern) that holds API key, history, and a telemetry note. Per user decisions, **UI language and Langfuse keys are explicitly out of scope** for this PR.

## Decisions (confirmed with the user)

- **Button**: inline-SVG gear icon (`stroke="currentColor"`), absolutely positioned in the top-right of the page, scrolls with the page (not fixed). Unicode `⚙︎` only as a fallback if SVG inlining proves awkward.
- **Panel**: replace sidebar with a centered modal + backdrop, mirroring `.history-modal`. Close via internal Close button, click on backdrop, or `Esc`.
- **API key**: **move the input field out of Setup into the Settings modal.** Setup keeps generation controls only.
- **History**: add `Clear all history` button + editable `session_limit` (default 300).
- **Save model**: one bottom **Save settings** button for the whole modal; Cancel discards local edits.
- **Shrinking session_limit**: truncate immediately, with `window.confirm` warning *N sessions will be deleted*.
- **Confirms**: `window.confirm` for Clear API key, Clear history, and shrinking session_limit below current count.
- **Sections**: simple stacked sections using existing `.section-kicker` style — `API KEY`, `HISTORY`, `TELEMETRY` (note-only).
- **Out of scope**: UI language selector, Langfuse keys in UI, `keep_last_audio` toggle, theme.

## Files to change

### Backend — Python

- `src/sayclearly/history/service.py` — add `clear_history()` method that overwrites `history.json` with an empty `sessions` list (atomic write via existing storage helpers).
- `src/sayclearly/history/service.py` — add `enforce_limit(limit)` (or extend `save_session` flow) that re-truncates existing sessions when `session_limit` shrinks below current count. Used by the config save path.
- `src/sayclearly/history/api.py` — add `DELETE /api/history` endpoint wired to `clear_history()`.
- `src/sayclearly/config/service.py` (or `api.py`) — when `POST /api/config` lowers `session_limit` below current history length, call `enforce_limit` so the truncation is observable immediately on next `GET /api/history`.
- `tests/test_history_service.py` (new or existing) — happy-path tests for `clear_history` and shrink-on-save.
- `tests/test_history_api.py` (or extend existing) — test for `DELETE /api/history`.

### Frontend — TypeScript & templates

- `src/sayclearly/templates/index.html`:
  - Add an absolute-positioned `<button data-open-settings-button>` containing an inline SVG gear (24×24, `stroke="currentColor"`, `aria-label="Settings"`) at the top-right of `.shell-grid`. Remove the existing in-hero "Settings" button.
  - Replace the current `<aside class="panel settings-panel">` with a new `<div class="settings-modal" hidden>` mirroring `.history-modal`: a backdrop, a panel, sections (`API KEY`, `HISTORY`, `TELEMETRY`), bottom action row (`Save settings`, `Close`).
  - Move the API key `<input>` and its hint out of the Setup card into the modal's `API KEY` section. Add a `Clear stored API key` button and the existing status text there.
  - Add `HISTORY` section: a numeric `<input type="number" min="50" max="1000">` for `session_limit` and a `Clear all history` button.
  - Keep the telemetry note read-only inside `TELEMETRY` (env-only behavior unchanged).
- `src/sayclearly/static/dom_elements.ts` — register new selectors (modal root, backdrop, save button, history limit input, clear-history button, gear button), remove obsolete sidebar selectors.
- `src/sayclearly/static/features/settings.ts` —
  - Toggle modal open via `state.isSettingsOpen`; show/hide the modal element instead of the sidebar.
  - Wire backdrop-click and `Escape`-key handlers (look at how `features/history.ts` does it for the existing history modal — reuse the same approach for consistency).
  - Implement local edit buffer for the API key input, telemetry-note remains static, and `session_limit` numeric input.
  - On `Save settings`: validate `session_limit` (positive integer); if it shrinks the saved history, `window.confirm` the deletion count. Then call `saveConfig(...)` with `ConfigUpdatePayload`. On success, refresh the displayed status.
  - `Clear stored API key`: `window.confirm`, then `deleteApiKey(...)`.
  - `Clear all history`: `window.confirm`, then call new `clearHistory(...)` from `api_client.ts`, then refresh history list.
- `src/sayclearly/static/api_client.ts` — add `clearHistory(fetchImpl)` calling `DELETE /api/history`. Confirm `saveConfig` already supports `gemini.api_key` and `session_limit` (it does — see `ConfigUpdatePayload`).
- `src/sayclearly/static/render/setup.ts` — drop the API key input wiring (it's gone from Setup); ensure Generate flow surfaces a clear "API key missing — open Settings" hint when needed.
- `src/sayclearly/static/api_types.ts` — regenerated by `npm run generate:types` after the backend endpoint is added (do NOT hand-edit).
- `src/sayclearly/static/styles.css`:
  - Remove `.settings-panel` and the `.shell-grid`-flex sidebar handling (back to single-column main content).
  - Add `.settings-modal`, `.settings-modal-backdrop`, `.settings-modal-panel` mirroring `.history-modal*` styles. Reuse existing `.section-kicker`, `.button-*` classes.
  - Add `.settings-icon-button` — circular 2.5rem button, transparent background, subtle border on hover, positioned via `.shell-grid { position: relative }` + `.settings-icon-button { position: absolute; top: 1rem; right: 1rem; }`. Icon inherits `currentColor`.
- `frontend-tests/app.test.js` — update existing settings-panel toggle tests (selectors changed: `[data-settings-panel]` → `[data-settings-modal]`); add tests for `Clear all history`, `session_limit` save with confirm, and shrink-truncation on the backend round-trip (via the existing in-memory backend stub).

## Critical files to read before/while implementing

- `src/sayclearly/templates/index.html` — Settings markup at lines 18 and 279–294; History modal markup ~296–324 (pattern to mirror).
- `src/sayclearly/static/styles.css` — lines 72–87 (`shell-grid`, `settings-panel` to remove), the `.history-modal*` block (pattern to copy), 412–427 (responsive — keep simple now that sidebar is gone).
- `src/sayclearly/static/features/settings.ts` and `features/history.ts` — settings open logic + history modal close-on-backdrop/Esc pattern to reuse.
- `src/sayclearly/static/render/setup.ts` (line ~134) — current visibility flip of sidebar (`elements.settingsPanel.hidden = !isSettingsOpen`); remove.
- `src/sayclearly/static/api_client.ts` (lines 83–109) — `fetchConfig`, `saveConfig`, `deleteApiKey`. Add `clearHistory` next to them.
- `src/sayclearly/config/api.py` & `models.py` — `ConfigUpdatePayload` already exposes `session_limit` and `gemini.api_key`; no payload changes needed.
- `src/sayclearly/history/service.py` (line 47) — current `[: config.session_limit]` truncation; the same logic moved into `enforce_limit`.
- `frontend-tests/app.test.js` — settings tests at lines 453–467, 615–646.

## SVG asset

Inline a minimal gear path directly in `index.html`. A small, hand-written 24×24 SVG (gear teeth + center circle, stroke-based, `currentColor`) avoids a build dependency. Sample shape: outer 8-tooth ring + inner circle. Keep it stroked rather than filled so it inherits the muted ghost-button color and matches the warm theme. If the inline path turns out fiddly, fall back to Unicode `⚙︎` wrapped in a span — the user accepted this fallback.

## Verification

After implementation:

1. `npm run generate:types` — regenerate `api_types.ts` after the backend endpoint lands.
2. `npm run build:frontend` — rebuild the bundle (also enforced by the pre-commit hook).
3. `npm run test:frontend` — confirm updated and new frontend tests pass.
4. `uv run pytest` — confirm new backend tests for `clear_history`, `DELETE /api/history`, and shrink-on-save pass.
5. `uv run ruff check .` and `uv run ruff format --check .` — lint/format clean.
6. **Manual smoke test** (`uv run sayclearly`):
   - Home shows gear in top-right; Setup card no longer has API key field.
   - Click gear → modal centered with backdrop; `Esc` and backdrop-click close it.
   - Enter API key, Save → status updates, Generate now works.
   - Set `session_limit` lower than current history → confirm dialog shows the deletion count; accept → list trims; cancel → unchanged.
   - `Clear stored API key` → confirm, then status flips to "no key stored".
   - `Clear all history` → confirm, then history modal shows empty state.
   - Resize to <960px viewport: modal stays usable (centered, scrolls if tall).
