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

### Development

```bash
npm run test:frontend
uv run pytest
uv run ruff check .
uv run ruff format --check .
```
