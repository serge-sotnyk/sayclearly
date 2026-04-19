## Overview

**SayClearly** — local-only diction training tool with a web UI and Gemini-based feedback.

- Single-user MVP launched locally via `uvx`
- FastAPI backend with Jinja2 templates and plain TypeScript frontend
- Specification: `docs/sayclearly_mvp_spec_en.md`

## Commands

```bash
# Install dependencies
uv sync

# Run the app locally
uv run sayclearly

# Run tests
uv run pytest

# Lint
uv run ruff check .

# Format check
uv run ruff format --check .
```

## Project Structure

```text
docs/
├── commands/                    # Reusable workflow prompts copied from sotnyk-ai-workflow
├── features/                    # Future feature plans
└── sayclearly_mvp_spec_en.md    # Product and MVP specification
src/
└── sayclearly/
    ├── __init__.py              # Package metadata
    └── main.py                  # CLI entry point placeholder
tests/
├── __init__.py                  # Test package marker
└── test_smoke.py                # Basic project smoke test
pyproject.toml                   # Project metadata and tool configuration
README.md                        # Project overview and local setup
AGENTS.md                        # Shared repository instructions for AI agents
CLAUDE.md                        # Points Claude-compatible tools to AGENTS.md
```

## Code Style

- Use English for code, comments, commit messages, and documentation inside the repository
- Target Python 3.13+
- Use `uv` for dependency management and project commands
- Use `ruff` for linting and formatting; keep configuration in `pyproject.toml`
- Prefer typed Python code, small modules, and explicit data models for API and storage boundaries
- Keep application logic separated from storage, Gemini integration, and HTTP handlers
- Add tests with `pytest` for storage, state transitions, and response normalization as code appears

## Configuration

- Store local runtime data under `~/.sayclearly/`
- Keep user secrets out of git; use local config or runtime input for Gemini API keys
- Optional telemetry is controlled by `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST`
- Ignore only local AI overrides: `.claude/**/*.local.*` and `CLAUDE.local.md`

## Development Notes

- This repository starts as infrastructure only; application code is added in later implementation steps
- Use the `ctx7` CLI for current library/framework documentation when working with external dependencies
- Keep the MVP local-only: no remote backend, no shared key storage, no long-term audio retention by default
