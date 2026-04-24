## SayClearly

Local-only diction training tool with a web UI and Gemini-based feedback.

The MVP specification lives in `docs/sayclearly_mvp_spec_en.md`.

### MVP launch

```bash
uvx --from git+https://github.com/serge-sotnyk/sayclearly sayclearly
```

This is the intended MVP launch path. It starts the local FastAPI server and opens the browser. Runs fully locally on your machine.

### Local development setup

```bash
npm install
uv sync
```

### Local development run

```bash
npm run build:frontend
uv run sayclearly
```

`uv run sayclearly` uses the same local app entry point for development. The frontend bundle under `src/sayclearly/static/dist/` is committed so the packaged repository snapshot still has the browser assets needed by the MVP launch path.

### Local `.env` Overrides

Copy `.env.example` to `.env` when you want local development-only overrides.

`uv run sayclearly` loads `.env` only from the current working directory. It does not search parent directories.

`.env.example` includes two optional Gemini model override variables:

- `SAYCLEARLY_DEFAULT_TEXT_MODEL`
- `SAYCLEARLY_DEFAULT_ANALYSIS_MODEL`

### Development

```bash
npm run test:frontend
uv run pytest
uv run ruff check .
uv run ruff format --check .
```
