## SayClearly

Local-only diction training tool with a web UI and Gemini-based feedback.

The MVP specification lives in `docs/sayclearly_mvp_spec_en.md`.

### MVP launch

```bash
uvx --from git+https://github.com/serge-sotnyk/sayclearly sayclearly
```

This is the intended MVP launch path. It starts the local FastAPI server, opens the browser, and runs fully locally on your machine. Runs fully locally on your machine.

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
