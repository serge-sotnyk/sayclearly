# Frontend Stabilization Plan: Process Hardening + Modularization

## Context

SayClearly systematically suffers frontend regressions after every feature (53% of commits over the last 30 days are `fix` commits; the cycle "feature → 4–5 fixes" recurs across Stage 7, Stage 8, and Post-MVP UX). The root cause is not the stack choice (Jinja + plain TS is appropriate for a local single-user MVP) but the internal organization of the frontend:

- `app.ts` — **1,519 lines**, of which a single `startApp` function is ≈ 1,350 lines, with a giant `render()` made up of solid `if` chains across 13 flow states and 30+ closure-scoped state variables.
- `ShellElements` — **81 DOM selectors** that have to stay in sync between `index.html`, the type declaration, the factory, and every consumer.
- **`dist/app.js` is committed to git.** Drift between source and bundle has already been fixed by an explicit commit [`0be041e`](C:\repos\sotnyk\sayclearly\src\sayclearly\static\dist\app.js) — *"sync frontend tests and rebuild bundle after Stage 8 merge"*.
- TypeScript types for API payloads (`SessionAnalysis`, `HistorySession`, `RecordingAnalysisResult`, `RecentTopicEntry`) are **manually duplicated** between Pydantic and `app_state.ts`, with no runtime validation.
- Endpoint URLs are hardcoded in **12+ places** in `app.ts`.

The user plans several more medium-sized features, so investing in stability pays off. The chosen path is A + B: first close the process gaps, then split `app.ts` into domain modules. The radical move to Preact/Solid (option C) is deferred.

**Important precondition:** the working tree currently holds ~1.3k lines of uncommitted frontend work (Post-MVP UX). Commit that work before starting the refactor so the refactor does not get tangled with feature changes.

---

## Phase A — Process Hardening (1–2 days)

### A1. Block stale-bundle commits with a pre-commit hook

**Problem:** [README.md:76](README.md:76) explicitly states the bundle is committed because `uvx --from git+...` consumes a git snapshot and needs the JS to be ready. Moving the build into wheel creation (e.g. via a Hatch build hook) would force `npm` onto every end user, since `uvx` builds the wheel **on the user's machine**. That breaks the "single-command launch via `uv`" promise of the MVP.

**Solution — keep the bundle in git, prevent stale commits with a pre-commit hook.** The bundle continues to ship in git so the `uvx` install path stays as it is and end users still need only `uv`. A hook physically blocks commits where TS source has changed without a refreshed bundle, which is exactly the failure mode behind commit [`0be041e`](src/sayclearly/static/dist/app.js) ("sync frontend tests and rebuild bundle after Stage 8 merge").

1. Add `pre-commit` to dev dependencies: `uv add --dev pre-commit`.
2. Create `.pre-commit-config.yaml` at the project root with a `repo: local` hook that:
   - triggers on staged changes under `src/sayclearly/static/*.ts` (and `tsconfig.json`),
   - runs `npm run build:frontend`,
   - then asserts `git diff --exit-code src/sayclearly/static/dist/` — if the rebuild produced any diff, the commit fails with a clear message telling the developer to `git add src/sayclearly/static/dist/` and re-commit.
3. Document the one-time `pre-commit install` step in [README.md](README.md:64) (Local development setup) and [AGENTS.md](AGENTS.md). Mention it explicitly so a fresh clone does not silently bypass the check.
4. Add a CI backstop (GitHub Actions, even a single `npm run build:frontend && git diff --exit-code` step) so a developer who forgot to run `pre-commit install` still cannot land a stale bundle.

**Out of scope:** moving the build into wheel creation, removing `dist/*.js` from git, changing `.gitignore`, or touching the `uvx --from git+...` install path. None of those are needed once the hook plus CI backstop close the drift window.

### A2. Centralize API endpoints

Create `src/sayclearly/static/api_client.ts` with typed wrappers around the existing `requestJson` (currently [app.ts:559–574](src/sayclearly/static/app.ts:559)):

```ts
const API = {
  config: '/api/config',
  apiKey: '/api/config/api-key',
  generate: '/api/generate-text',
  analyze: '/api/analyze-recording',
  history: '/api/history',
  historyById: (id: string) => `/api/history/${encodeURIComponent(id)}`,
} as const;

export async function fetchConfig(): Promise<PublicConfig> { ... }
export async function saveConfig(payload: ConfigUpdate): Promise<PublicConfig> { ... }
// etc.
```

Replace all 12+ hardcoded URLs in `app.ts` with calls into these functions. This eliminates the silent-404 risk on endpoint renames and gives a single edit point.

### A3. Generate TS types from the FastAPI OpenAPI

1. Add `openapi-typescript` to `package.json` (devDependencies).
2. Add an npm script `generate:types` that:
   - runs `uv run python -c "import json; from sayclearly.app import create_app; print(json.dumps(create_app().openapi()))" > openapi.json`
   - runs `npx openapi-typescript openapi.json -o src/sayclearly/static/api_types.ts`
3. Wire it into `build:frontend`: either as a pre-build step, or by committing the generated `api_types.ts` and asserting freshness in CI/tests.
4. In `app_state.ts`, replace the manual interfaces (`SessionAnalysis`, `HistorySession`, `RecordingAnalysisResult` — lines 145–170) with type aliases imported from the generated types.

**Decide separately:** whether to keep `RecentTopicEntry` manual (it ships through a `<script type="application/json">` block in Jinja, not through the API). Most likely yes — it is a different transport channel.

### A4. Runtime contract test for response shapes

A single parametrized pytest that hits `/api/history` and `/api/config` and asserts that the Pydantic serialization produces exactly the fields `app.ts` expects. Guards against accidental `model_dump(exclude_none=True)` and similar drift.

---

## Phase B — Modularize `app.ts` (~5–7 days)

Goal: replace the single 1,500-line `startApp` function with a thin composer plus 5 domain modules. Each module is isolated and testable on its own. **Keep `app_state.ts` as is — it is the healthy core.**

### Target structure

```
src/sayclearly/static/
├── app.ts                 ~150 lines, thin composer
├── app_state.ts           unchanged (state core)
├── api_client.ts          from A2
├── api_types.ts           generated in A3
├── dom_elements.ts        ShellElements + collectShellElements (from current app.ts:114–314)
├── render/
│   ├── index.ts           main render(model, elements) — dispatcher
│   ├── setup.ts           home/setup screen
│   ├── exercise.ts        step_1/step_2/step_3
│   ├── recording.ts       recording indicator/timer
│   ├── review.ts          result panel
│   └── history.ts         list + details + modal
└── features/
    ├── settings.ts        attachSettingsHandlers(elements, ctx)
    ├── exercise.ts        attachExerciseHandlers(elements, ctx)
    ├── recording.ts       attachRecordingHandlers(elements, ctx) — timers/tokens/clearArtifacts
    ├── review.ts          attachReviewHandlers(elements, ctx)
    └── history.ts         attachHistoryHandlers(elements, ctx)
```

`ctx` is a shared object exposing `getModel()`, `setModel(updater)`, `rerender()`, `setBanner(msg)`, plus `recordingApi` and access to `api_client`. This gives each module the minimum surface it needs without sharing 30 variables through a closure.

### Step order (one commit per step — refactors are safer in small slices)

**B1.** Move `ShellElements` / `collectShellElements` / `getRequiredElement` from `app.ts:114–314` into `dom_elements.ts`. The 28 tests in `frontend-tests/app.test.js` must stay green.

**B2.** Create `render/index.ts` and move `render()` ([app.ts:576–775](src/sayclearly/static/app.ts:576)) into it. Still one file at this step — no per-screen split yet. The point is to isolate render as a pure function.

**B3.** Split `render/index.ts` into per-screen modules (`setup.ts`, `exercise.ts`, `recording.ts`, `review.ts`, `history.ts`). The top-level `render()` becomes a `model.flow` dispatcher. Each per-screen renderer takes only the elements and the slice of model it needs — that immediately surfaces unnecessary dependencies.

**B4.** Introduce the `ctx` object and move recording timers/tokens/`clearRecordingArtifacts` into `features/recording.ts`. This is the hardest spot (see [app.ts:1121–1202](src/sayclearly/static/app.ts:1121)) — token cancellation, MediaRecorder, async getUserMedia, and timers are all tangled. Isolate them in one module with an explicit `start/stop/reset` lifecycle.

**B5.** Move the remaining handler groups out (`features/settings.ts`, `exercise.ts`, `review.ts`, `history.ts`). Each is an `attach*Handlers(elements, ctx)`.

**B6.** `app.ts` becomes thin:
```ts
async function startApp(...) {
  const elements = collectShellElements(root);
  const ctx = createAppContext({ elements, recordingApi, initial });
  attachSettingsHandlers(elements, ctx);
  attachExerciseHandlers(elements, ctx);
  attachRecordingHandlers(elements, ctx);
  attachReviewHandlers(elements, ctx);
  attachHistoryHandlers(elements, ctx);
  ctx.rerender();
}
```

**B7.** Add unit tests for `features/recording.ts` (timers, cancellation of stale recordings), `features/history.ts` (modal filtering), and the tricky parts of `render/`. The existing integration tests in `frontend-tests/app.test.js` remain as a safety net.

### What is NOT in this plan

- No move to Preact / Solid / Lit (that is option C).
- No changes to `app_state.ts` — it is already good.
- No changes to backend domain packages (`exercise/`, `recording/`, `history/`, `config/`) — they are fine.
- No reshaping of API endpoint design.

---

## Critical files

**Created:**
- `.pre-commit-config.yaml` (A1)
- `src/sayclearly/static/api_client.ts` (A2)
- `src/sayclearly/static/api_types.ts` (A3, generated)
- `src/sayclearly/static/dom_elements.ts` (B1)
- `src/sayclearly/static/render/{index,setup,exercise,recording,review,history}.ts` (B2–B3)
- `src/sayclearly/static/features/{settings,exercise,recording,review,history}.ts` (B4–B5)
- `tests/test_api_contracts.py` (A4)
- A minimal GitHub Actions workflow (e.g. `.github/workflows/frontend-bundle.yml`) for the CI backstop in A1

**Modified:**
- [pyproject.toml](pyproject.toml) — `pre-commit` added to dev dependencies (A1)
- [package.json](package.json) — `generate:types`, `openapi-typescript` (A3)
- [src/sayclearly/static/app.ts](src/sayclearly/static/app.ts) — shrinks dramatically over B1–B6
- [src/sayclearly/static/app_state.ts](src/sayclearly/static/app_state.ts:145) — types redirected to the generated ones (A3)
- [README.md](README.md:64) and [AGENTS.md](AGENTS.md) — `pre-commit install` step plus the existing local-dev flow (A1)

**Not removed from git:** `src/sayclearly/static/dist/app.js` and `dist/app_state.js` stay committed — that is required for the `uvx --from git+...` MVP launch path.

---

## Verification

After each phase:

1. `npm run build:frontend` — TS compiles cleanly (`tsc --strict` is already enabled).
2. `npm run test:frontend` — all 28 tests in `frontend-tests/app.test.js` and `app_state.test.js` are green.
3. `uv run pytest` — all pytest tests are green.
4. `uv run ruff check . && uv run ruff format --check .` — clean.
5. **Manual smoke** of `uv run sayclearly`, walking a full flow:
   - generate an exercise,
   - go through the 3 steps,
   - record audio (or mock it),
   - receive the analysis,
   - open history → pick a session → return,
   - reuse a topic from history.
6. **MVP-path sanity check** (after A1): in a clean environment, run `uvx --from <local-clone-or-wheel> sayclearly` **without** `npm` installed. The bundled `dist/*.js` must be served and the app must work — confirming we did not accidentally move the build into install time.

After Phase B, additionally:
- `app.ts` ≤ 200 lines.
- Each `features/*.ts` module ≤ 250 lines.
- The 53% fix-commit ratio should drop noticeably during the next round of features — this is the empirical success criterion, observable after 1–2 features.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Developer skips `pre-commit install` after a fresh clone, hook silently does nothing | CI backstop in A1 (`npm run build:frontend && git diff --exit-code`) catches stale bundles at PR time even when the local hook is missing. |
| The big refactor collides with the uncommitted UX work | First commit Post-MVP UX (1.3k lines), then start B. |
| Generated types drift from the manual ones in `app_state.ts` | Have `app_state.ts` import from `api_types.ts` rather than duplicate — single source of truth. |
| Phase B drags out while features are waiting | B is split into 7 commits, can pause between steps. After B1 + B2 it is already noticeably better. |
| `frontend-tests/` are written against the current `startApp` shape | They are integration tests through `startApp` — they should survive the refactor because the external `startApp` contract does not change. If they break, that is a signal the test was checking internals rather than behavior. |
