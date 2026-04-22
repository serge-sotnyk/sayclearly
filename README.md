## SayClearly

Local-only diction training tool with a web UI and Gemini-based feedback.

The MVP specification lives in `docs/sayclearly_mvp_spec_en.md`.

### Setup

```bash
npm install
uv sync
```

### Run

```bash
npm run build:frontend
uv run sayclearly
```

Running `uv run sayclearly` starts the local FastAPI server on `127.0.0.1:8008`, opens the app in your browser, and exposes a simple health endpoint at `/api/health`.

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
