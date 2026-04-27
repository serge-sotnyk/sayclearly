# SayClearly Setup — History modal for topic + language coupling

## Context

On the startup screen, the "Reuse topic" button only brings back a single last topic (from `config.last_topic_prompt`), and the generation/analysis languages are decoupled from the topic. We want the user to be able to pick any topic from the entire history through an explicit modal search, and we want the chosen topic to drag its languages along. The `<select>` chevrons are left alone — that's a separate cosmetic task.

## High-level design

- In the setup form, next to the **Topic** field, a new **History** button (text label) appears. The "Reuse topic" button in the setup form is removed. The "Reuse topic" buttons in review-actions and history-detail (`index.html` ~line 207, 258) — stay; they already paste the chosen topic into the setup input.
- Clicking **History** opens a **modal dialog** (centered, with a backdrop), with a heading, a search input, and a scrollable list of topics. The same modal is used on desktop and on touch — single code path, large tap targets.
- Inside the modal there is its own **search input**, initialized with the current value of the setup Topic input. As the user types, the **top "Matches" block** updates with a substring filter (case-insensitive). Below it — a horizontal divider and the **bottom "All topics" block** with the entire history newest-first (including the same items that appear in matches — the bottom block stays as a stable sticky list). When the search is empty, the top block and divider are hidden.
- Each row: bold topic + `Text → Analysis` languages in small muted text. The row is a focusable button activated by click/Enter.
- On selection, the modal closes, the setup gets `topic`, `text_language`, `analysis_language` and the "Use the same language" toggle = (text == analysis casefold). A 5-second banner appears in `data-status-message`: "Languages restored from history: <Text> / <Analysis>".
- Manual typing in the setup input does **not** trigger restore (explicit action — popup only).
- On page load, the **Topic** field is pre-filled with the freshest topic from history, and for that topic languages are restored + banner is shown (same path as picking from popup).
- The old `last_topic_prompt` and `reuse_last_topic` plumbing is removed entirely (along with the REUSE banner and the `_resolve_topic` branch).
- `HistorySession` gains `analysis_language: str | None = None`. Legacy entries without this field — fallback to text language.
- JSON files (`history.json`, `config.json`, `secrets.json`) are written with `ensure_ascii=False` — Cyrillic and other non-ASCII characters are saved verbatim instead of as `\uXXXX` escapes. Right now `atomic_write_json` (storage/files.py:56) uses the default `ensure_ascii=True`, which makes the Topic and Text in history unreadable when inspecting the file by hand.
- `<select>` chevrons stay untouched — no `padding-right` change.

## Files to change

### Backend

#### `src/sayclearly/storage/models.py`
- `StoredConfig` (line 38): drop `last_topic_prompt: str = ""`.
- `HistorySession` (~line 94): add `analysis_language: str | None = None`. `extra="forbid"` is compatible with legacy records lacking the field (a missing field is the default, not an unknown key).

#### `src/sayclearly/storage/files.py`
- `_build_product_default_config()` (line 73-92): drop `"last_topic_prompt": ""` (line 81).
- `load_config`: add a call to `_strip_obsolete_config_keys(payload)` after `_migrate_config_payload`. The helper drops `last_topic_prompt` (and any other key in `_OBSOLETE_CONFIG_KEYS = frozenset({"last_topic_prompt"})`) so a legacy config.json does not blow up under `extra="forbid"`.
- `atomic_write_json` (line 56): switch `json.dump(..., ensure_ascii=True, ...)` → `ensure_ascii=False`. Applies at once to every atomic write (`config.json`, `secrets.json`, `history.json`). The file is still written in UTF-8 (`encoding="utf-8"`) and `os.replace` keeps the write atomic.

#### `src/sayclearly/config/models.py` + `src/sayclearly/config/service.py`
- Drop every reference to `last_topic_prompt` (the field on `PublicConfigView` line 120 and `ConfigUpdatePayload` line 77; assignments in service.py lines 68, 99).

#### `src/sayclearly/exercise/models.py`
- Drop `reuse_last_topic: bool` from `ExerciseGenerationRequest` (line 10).

#### `src/sayclearly/exercise/service.py`
- In `generate_text`, use `request.topic_prompt.strip()` directly.
- Remove the `_resolve_topic` method (lines 99-105).

#### `src/sayclearly/history/service.py`
- Add the Pydantic model `RecentTopicEntry { topic: str, text_language: str, analysis_language: str }`.
- Add the method `recent_topic_entries(limit: int | None = None) -> list[RecentTopicEntry]`:
  - Pulls `load_history(...).sessions` (newest-first per `save_session` line 36).
  - For each: `topic = (s.topic_prompt or "").strip()` → skip if empty.
  - Dedup by `topic.casefold()`, first (freshest) occurrence wins.
  - Record: `text_language=s.language`, `analysis_language=s.analysis_language or s.language` (legacy fallback).
  - When `limit` is set — cap after N unique. For our case, called without `limit` (entire history).

#### `src/sayclearly/app.py`
- `home()` (lines 31-37): build a `HistoryService(data_root)`, compute `recent = history_service.recent_topic_entries()` (no cap), `initial_topic = recent[0].topic if recent else None`. Pass into context: `recent_topics=[e.model_dump() for e in recent]`, `initial_topic=initial_topic`. Wrap in `try/except StorageError` → empty fallback.

### Frontend templates / styles

#### `src/sayclearly/templates/index.html`
- In the topic field (line 142-145): wrap the `<input>` and the new `History` button in a flex row (`<div class="topic-row">`). Set `value="{{ initial_topic if initial_topic else '' }}"` on the input.
  ```
  <label class="field field-topic">
    <span>Topic</span>
    <div class="topic-row">
      <input type="text" name="topic" placeholder="Ordering coffee before work" data-topic-input value="..." />
      <button type="button" class="button button-secondary" data-history-button>History</button>
    </div>
  </label>
  ```
- Drop the `data-reuse-topic-button` button (line 148). Buttons in review-actions (line 207) and history-detail (line 258) **stay**.
- Before the closing `</main>` (or right after it), add the modal dialog markup (initially hidden):
  ```
  <div class="history-modal" data-history-modal hidden role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
    <div class="history-modal-backdrop" data-history-modal-backdrop></div>
    <div class="history-modal-dialog">
      <div class="history-modal-heading">
        <h2 id="history-modal-title">Recent topics</h2>
        <button type="button" class="button button-ghost" data-history-modal-close aria-label="Close">×</button>
      </div>
      <input type="search" placeholder="Filter topics..." data-history-modal-search />
      <div class="history-modal-body" data-history-modal-body>
        <p class="history-modal-empty" data-history-modal-empty hidden>No saved topics yet.</p>
        <section class="history-modal-section" data-history-modal-matches-section hidden>
          <p class="history-modal-section-label">Matches</p>
          <ul class="history-modal-list" data-history-modal-matches-list></ul>
        </section>
        <hr class="history-modal-divider" data-history-modal-divider hidden />
        <section class="history-modal-section" data-history-modal-all-section>
          <p class="history-modal-section-label">All topics</p>
          <ul class="history-modal-list" data-history-modal-all-list></ul>
        </section>
      </div>
    </div>
  </div>
  ```
- Before the final `<script type="module">` (line 288), add a server-rendered payload:
  ```
  <script type="application/json" data-recent-topics-payload>{{ recent_topics | tojson }}</script>
  ```

#### `src/sayclearly/static/styles.css`
- `.topic-row` styles — flex with `gap: 0.6rem`; the button gets auto-width, the input is flex:1.
- `.history-modal` styles (fixed, inset 0, hidden), `.history-modal-backdrop` (semi-transparent overlay), `.history-modal-dialog` (centered, max-width: min(640px, 92vw), max-height: 80vh, overflow-y auto, padding, border-radius, background, box-shadow).
- `.history-modal-heading` — flex, title on the left, close button on the right.
- `.history-modal-search` (targets the existing `input` style), `.history-modal-section-label` — eyebrow style, `.history-modal-divider` — a plain `<hr>` in a muted color.
- `.history-modal-list` — bullet-less list, gap between items; `.history-modal-row` — full-width row button, hover/focus highlight, padding ~0.7rem 0.9rem, bold topic text, small muted subtitle for languages (`color: rgba(82, 96, 109, 0.65)`). No `padding-right` change on `<select>`.

### Frontend logic

#### `src/sayclearly/static/app_state.ts`
- Drop `last_topic_prompt` from `PublicConfig` (line 96), `DEFAULT_CONFIG` (line 216), `ConfigUpdatePayload` (line 176), `buildSettingsFromConfig` (line 248), `buildConfigUpdatePayload` (lines 322-332).
- Drop `reuse_last_topic` from `SettingsFormState` (line 112), `GenerateRequest` (line 168), `buildGenerateRequest` (line 313). Drop `reuse_last_topic: false` from `reuseTopic(model, topicPrompt)` (line 534-543).
- In the `HistorySession` interface, add `analysis_language: string | null`.
- New exported types and helpers:
  - `interface RecentTopicEntry { topic: string; text_language: string; analysis_language: string; }`
  - `interface InitialPageData { recent_topics: RecentTopicEntry[]; initial_topic: string | null; }`
  - `dedupeRecentTopics(entries) → entries` — case-insensitive dedup, first occurrence wins, empties excluded.
  - `pushRecentTopic(entries, next, limit?)` — prepend → dedupe → optionally slice.
  - `findRecentTopicMatch(entries, topicValue)` — trim+casefold compare → entry|null.
  - `filterRecentTopics(entries, query)` — substring filter (trim + casefold), preserves order (newest-first).

#### `src/sayclearly/static/app.ts`
- Drop `REUSE_STATUS` (line 43), `reuseTopicButton` from `ShellElements`/`collectShellElements`, the click handler (lines 833-836), the `reuseNextGeneration` state (line 711), all of its plumbing through `getStatusMessage` (lines 366-377), `readSettings`, `render(...)`, and the line `elements.reuseTopicButton.disabled = isGenerating;` (line 544). `getStatusMessage` becomes `(model, transientBanner)`.
- Add to `ShellElements`/`collectShellElements`:
  - `historyButton` (`[data-history-button]`)
  - `historyModal`, `historyModalBackdrop`, `historyModalCloseButton`, `historyModalSearchInput`, `historyModalMatchesSection`, `historyModalMatchesList`, `historyModalDivider`, `historyModalAllList`, `historyModalEmpty` (all by `[data-…]` selectors).
- Add state in `startApp`:
  - `let recentTopics: RecentTopicEntry[] = readInitialPageData(documentRef).recent_topics;`
  - `let isHistoryModalOpen = false;`
  - `let transientBannerMessage: string | null = null;`
  - `let transientBannerTimeout: ReturnType<typeof setTimeout> | null = null;`
- Helpers:
  - `readInitialPageData(documentRef)` — JSON.parse `<script data-recent-topics-payload>`.
  - `setTransientBanner(message, ms = 5000)` — clearTimeout, set message, render, schedule clear → render.
  - `restoreLanguagesFromEntry(entry)` — sets `text_language`, `analysis_language`, `same_language_for_analysis = (text === analysis casefold)`, calls `syncAnalysisLanguage`, render, banner.
  - `openHistoryModal()` — `isHistoryModalOpen = true`, `historyModalSearchInput.value = topicInput.value`, render modal, focus search.
  - `closeHistoryModal()` — `isHistoryModalOpen = false`, render.
  - `selectHistoryEntry(entry)` — `topicInput.value = entry.topic`, `model.settings.topic_prompt = entry.topic`, `restoreLanguagesFromEntry(entry)`, `closeHistoryModal()`.
  - `renderHistoryModal()` — updates the matches/all sections via `filterRecentTopics(recentTopics, search)`, fills the lists with row-button elements wired to `selectHistoryEntry`. When `recentTopics.length === 0` — show the empty state, hide both sections/divider. When the search is empty — hide matches and divider, show only `all`. When the search is non-empty — show matches (even if empty, with a "No matches" caption) + divider + `all` (full, with overlap).
- Event wiring:
  - `historyButton.click` → `openHistoryModal()`.
  - `historyModalCloseButton.click`, `historyModalBackdrop.click` → `closeHistoryModal()`.
  - `documentRef.keydown` (Escape) → if open — `closeHistoryModal()`. (Combine with the existing popover-Escape listener.)
  - `historyModalSearchInput.input` → `renderHistoryModal()`.
- Topic-input handler (line 826-831): drop the `reuseNextGeneration` branch. Language restore does **not** fire on manual typing (per requirement).
- `getStatusMessage` priority order: `error_message` > `flow === 'generating_text'` > `transientBannerMessage` > exercise-ready > READY.
- In `render(...)` render the modal: `historyModal.hidden = !isHistoryModalOpen`. Also call `renderHistoryModal()` while the modal is open.
- `buildHistorySession` (lines 466-478): add `analysis_language: exercise.analysis_language ?? exercise.language ?? null`.
- After a successful `saveHistorySession`:
  - `recentTopics = pushRecentTopic(recentTopics, { topic: latestSession.topic_prompt, text_language: latestSession.language, analysis_language: latestSession.analysis_language ?? latestSession.language });` (only if `topic_prompt` is non-empty).
  - When the modal is open — `renderHistoryModal()` will pick up the new list; otherwise it kicks in on the next open.
- Startup load in `startApp`:
  - `const initialData = readInitialPageData(documentRef);`
  - `recentTopics = initialData.recent_topics;`
  - When `initialData.initial_topic` is set — seed `model.settings.topic_prompt = initialData.initial_topic` BEFORE the first `render`.
  - After the first render and applying `/api/config`: when `initialData.initial_topic` is set — find a match via `findRecentTopicMatch(recentTopics, initialData.initial_topic)` and call `restoreLanguagesFromEntry(match)` (the same flow as picking from popup, so we get the banner).

### Tests

#### Python (`tests/`)
- `test_storage.py` (lines 72, 95, 129) — drop `last_topic_prompt` from fixtures; add tests:
  - `analysis_language` round-trip on `HistorySession`.
  - Legacy entry without `analysis_language` → field is `None`.
  - `_strip_obsolete_config_keys` for a config carrying `last_topic_prompt` — load passes, the field is absent in the rewritten file.
  - Saving a `HistoryStore` with a Cyrillic `topic_prompt`/`text` — on disk we see UTF-8 with no `\u` escapes (assert raw `path.read_text(encoding="utf-8")` contains the original Cyrillic text).
- `test_config_api.py` (line 15), `test_config_service.py` (line 18), `test_stage_3/4/7_flow_integration.py` — drop `last_topic_prompt`/`reuse_last_topic` from payload fixtures.
- `test_exercise_api.py`, `test_exercise_service.py` — delete `test_post_generate_text_can_reuse_last_topic_from_config`, `test_generate_text_reuses_last_topic_when_requested`; drop `reuse_last_topic` from request fixtures.
- **New** `tests/test_history_service.py::test_recent_topic_entries_*`: newest-first, case-insensitive dedup (freshest casing wins), legacy fallback `analysis_language=None → text_language`, empty/None excluded, `limit=None` returns everything, `limit=N` caps.
- **New** `tests/test_app_shell.py::test_home_page_renders_history_modal_and_button`: presence of `data-history-button`, `data-history-modal`, `data-history-modal-search`, `data-recent-topics-payload`; absence of `data-reuse-topic-button`; the topic input has `value="..."` for the latest topic.

#### Frontend (`frontend-tests/`)
- `app.test.js` (lines 167, 256, 511, 523, 543, 573, 586, 804, 826, 836) — drop every `[data-reuse-topic-button]`, `reuse_last_topic`, `last_topic_prompt` from the fakes; add stubs for `[data-history-button]`, `[data-history-modal]`, `[data-history-modal-search]`, `[data-history-modal-matches-list]`, `[data-history-modal-all-list]`, etc.
- `app_state.test.js` (lines 29, 124, 173, 178, 191, 198, 206, 224, 234, 242, 270) — drop `reuse_last_topic`/`last_topic_prompt`; add tests for `dedupeRecentTopics`, `pushRecentTopic`, `findRecentTopicMatch`, `filterRecentTopics` (substring case-insensitive, preserves order).
- **New** integration cases: open modal → items visible; typing in search filters matches (the bottom `all` block doesn't change); clicking a row closes the modal, sets the topic, sets the languages, shows the banner; after `save_session` the new topic lands at the head of `recentTopics`; ESC closes the modal.

## Reused utilities & references

- `HistoryService.list_history()` (history/service.py:18-19) — source for `recent_topic_entries`.
- `save_session` (history/service.py:36) — newest-first guaranteed.
- `syncAnalysisLanguage` (app_state.ts:272-281) — reused in `restoreLanguagesFromEntry`.
- `data-status-message` (index.html:25-28, app.ts:520-524) — slot for the transient banner.
- `LANGUAGES` constant (app_state.ts:18-39) — list of valid values for the existing language selects.
- The existing popover keydown handler (app.ts:868-876) — extend it with Escape handling for the history modal.

## Verification

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
npm run test:frontend
```

**Manual walkthrough** — `uv run sayclearly`, open `http://localhost:<port>/`:

1. **Clean history** (delete `~/.sayclearly/history.json`): Topic empty, the History button is clickable → modal with the empty state "No saved topics yet". The banner does not appear.
2. **One session → reload**: Topic is pre-filled with the latest; languages auto-restored; the banner "Languages restored from history: X / Y" shows for ~5 s.
3. **Open the History modal with no input**: the full history is visible (all unique entries, newest-first), the matches block is hidden, the divider is hidden.
4. **Type a substring into the modal search**: the matches block appears at the top, divider, then the full history below (overlapping with matches). Clearing the input — the reverse.
5. **Click a row**: the modal closes, the Topic gets pasted, languages and the checkbox change, the banner shows.
6. **ESC / click outside the dialog / × button**: the modal closes without changes.
7. **In-session refresh**: generate → analyze → save → start a new session → open the History modal — the new entry sits at the top without a reload.
8. **Manual entry of a matching topic in the setup input**: does NOT trigger restore (no banner, no language change).
9. **"Reuse topic" from review/history-detail**: keep working (paste topic into the setup input). Language restore does not happen — that's acceptable since restore is now bound to the popup pick. Optionally we may also call `findRecentTopicMatch + restoreLanguagesFromEntry` from the review-actions and history-detail Reuse handlers — a small bonus, not required.

## Risks

- **JSON payload size**: at 300 sessions ~50KB JSON. Acceptable. If it ever becomes a problem — move to a separate fetch `/api/recent-topics`.
- **`extra="forbid"` on StoredConfig**: legacy configs with `last_topic_prompt` need the strip helper, otherwise ValidationError on load.
- **Banner priority**: `transientBannerMessage` must **not** override `generating_text`; otherwise we'd see a stale toast during generation.
- **Modal scroll-lock**: on mobile the open modal must prevent the main content from scrolling (`body { overflow: hidden }` while the modal is open). In the implementation, toggle a `.is-modal-open` class on `<body>`.
- **A11y**: `<dialog>` semantics (`role="dialog" aria-modal="true"`), focus-trap inside the modal (focus returns to the History button on close). A minimal focus-trap is enough — autofocus on the search input + ESC + close button.
