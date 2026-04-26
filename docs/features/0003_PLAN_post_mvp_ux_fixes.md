# SayClearly — Post-MVP UX Fixes

## Context

After the first end-to-end iteration, manual testing surfaced five UX issues:

1. The hero panel is visually cramped: two long `field-hint` paragraphs about local-only operation and ephemeral recordings squeeze the title and never get read.
2. Generate has no in-flight visual feedback — the button looks idle even while `flow === 'generating_text'`. Worse, Gemini calls can stall (slow / looping high-thinking responses) and the user has no way to abort.
3. Text and Analysis languages are free-text inputs; users must remember exact strings Gemini understands.
4. Step 3 ("Retell and record") still shows the exercise text in full, defeating the purpose of retelling from memory.
5. The recording state is rendered with a neutral pill labelled "Stop recording" — there's no clear visual cue that recording is live, and no duration indicator.

This change set polishes those five spots only. Error-handling, history pane, and analysis flow are out of scope.

## Decisions (from interview)

- **Intro text:** move both long paragraphs into a hover/click popover anchored to the *Gemini API key* label, using a native `<details>` element so it works on mouse and touch. Drop both paragraphs from the hero.
- **Generate UX:** disable + spinner + elapsed seconds in status, AND a Cancel button using `AbortController`. Also tighten the click handler: set `flow='generating_text'` and `render()` *before* the first `await`, so the disabled state lands synchronously.
- **Language input:** native `<select>` with a curated list of 20 languages (full names). No free text. No migration: any saved value not in the list will fall through to the first option (English) in the rendered select.
- **Step 3 text:** wrapped in a `<details>` disclosure, collapsed by default, label "Show text" / "Hide text". Steps 1 & 2 stay unchanged (always-visible text).
- **Recording UX:** "Stop recording" button gets a danger-red treatment with an animated pulsing dot inside the label; `recording-status` shows live `mm:ss` timer; when the timer crosses 5:00 the status text gains a soft warning suffix ("Long recordings may not analyze well"). Recording does **not** auto-stop.

## Files to modify

| File | Change |
|------|--------|
| `src/sayclearly/templates/index.html` | Remove two long `field-hint` paragraphs from hero. Wrap "Gemini API key" label in a `<details class="info-popover">` with the moved copy as `<summary>`-paired content. Replace `<input type="text" data-text-language-input>` and `data-analysis-language-input` with `<select>` populated by 20 `<option>` entries. Wrap step-3 `.exercise-text` block in a `<details data-step3-details>` with `<summary>Show text</summary>`. Add a hidden `data-recording-timer` `<span>` inside `.recording-status`. Add a "Cancel" `<button data-cancel-generate-button hidden>`. Add `<span class="recording-dot" aria-hidden="true">` inside the stop button. |
| `src/sayclearly/static/styles.css` | Add: `.info-popover` styles (icon button, hover-open via `details[open]` + `:hover` opening on desktop, click on touch), `.button-danger` (red with `--danger: #c8341c`), `.recording-dot` keyframe pulse animation, `select` styling parity with current input fields, `.button[disabled]` cursor/opacity, `.spinner` (small CSS spinner), `details[data-step3-details]` styling so the disclosure looks intentional. Use a small CSS custom property block at the top of the file (`:root { --danger: #c8341c; }`) — no broad refactor of hardcoded colors. |
| `src/sayclearly/static/app.ts` | (a) Remove `getLocalStorageNote` driving of the hero paragraph (or repoint it to the popover body — keep `data-local-storage-note` selector working). (b) In the Generate click handler: create an `AbortController`, store on a closure variable, set `flow='generating_text'` and call `render()` synchronously before the first `await`, pass `signal` to all 3 `fetch` calls; in `finally`, clear the controller. (c) Wire `data-cancel-generate-button` click → `controller.abort()`; on `AbortError` reset to `'home'` flow without surfacing an error. (d) Render: show Cancel button while `flow==='generating_text'`, show spinner inside Generate, append `Generating... Ns` to status by ticking `setInterval` every 1 s while in that flow. (e) Recording: on start, capture `recordingStartedAt = Date.now()`, kick off `setInterval` to update `data-recording-timer` to `mm:ss`; on stop, clear interval and hide timer span. After 300 s, append warning to status text. (f) Reset Step 3 disclosure to closed every time we enter `step_3_retell_ready` (set `details.open = false`). |
| `src/sayclearly/static/app_state.ts` | Add a `LANGUAGES` constant (array of 20 names) exported for both runtime use and tests. Adjust default form values from `'uk'` to `'English'` in any state-init helpers. No schema changes to persisted config — values remain free strings on the wire. |
| `src/sayclearly/static/dist/app.js` | Rebuilt bundle (per repository convention). |
| `tests/` | Add `tests/test_languages_list.py` only if the language list also leaks into Python (e.g. validation). If not, frontend tests stay TypeScript. Add a small TS test (if test setup exists) verifying `LANGUAGES` length and first item. Verify by `git ls-files tests/` first; do not invent a TS test framework. |
| `README.md` | No change required (already documents local-only and ephemeral recordings). |

## Curated language list (in this order)

English, Ukrainian, Russian, German, French, Spanish, Portuguese, Italian, Polish, Dutch, Czech, Turkish, Japanese, Chinese (Simplified), Korean, Hindi, Arabic, Hebrew, Vietnamese, Indonesian.

Default selected: English.

## Touchpoints to re-use, not re-invent

- `data-*` attribute lookup pattern in `ShellElements` (app.ts:74–168) — extend with new attributes rather than introducing query-by-class.
- Existing render-driven state model in `app.ts:482–656` — keep all DOM mutations inside `render()`. Side effects (timers, AbortController) live next to the click handlers, with state stored on closure variables in `startApp()`.
- `syncAnalysisLanguage` in `app_state.ts:249–258` — already handles the same-language toggle; the switch from input to select doesn't change its contract.
- `recording-status` text node already exists; just append a child `<span>` for the timer instead of adding a new container.

## Verification

1. `uv run ruff check .` and `uv run ruff format --check .` (no Python logic changed, but pyproject lint must stay green).
2. `uv run pytest` — existing tests must pass; add the language-list test if added.
3. Build the frontend bundle (existing build step the project uses for `static/dist/app.js`).
4. `uv run sayclearly` and exercise these paths in the browser:
   - Hero shows compact title; clicking the "?" next to *Gemini API key* expands the popover; hovering on desktop also expands; Esc / click-outside / second click closes.
   - Click Generate → button shows spinner + "Generating... Ns" in status; Generate is disabled; Cancel appears; clicking Cancel returns to home with no error toast.
   - Both language fields are dropdowns with the 20-language list; toggling "Use the same language" still mirrors text → analysis.
   - Walk to Step 3: text is collapsed under "Show text"; Step 1 & 2 still show the text inline.
   - Start recording: button turns red with pulsing dot, timer counts up; after 5:00 the warning suffix appears in the status; clicking stop hides the timer.
5. Manually load an old `~/.sayclearly/config.json` with `text_language='uk'` and confirm the select renders English (no crash, no silent overwrite of stored config until the user saves).
