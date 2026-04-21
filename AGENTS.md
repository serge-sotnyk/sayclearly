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
    ├── __init__.py               # Package marker for the application package
    ├── app.py                   # FastAPI app factory and composition root
    ├── main.py                  # CLI entry point for local startup
    ├── config/                  # Configuration models, API, and service
    │   └── __init__.py           # Empty package marker
    ├── history/                 # Session history API and service
    │   └── __init__.py           # Empty package marker
    ├── storage/                 # Filesystem persistence models and helpers
    │   └── __init__.py           # Empty package marker
    ├── web/                     # Web-layer helpers such as error handling
    │   └── __init__.py           # Empty package marker
    ├── templates/               # Jinja2 templates
    └── static/                  # Frontend assets
tests/
├── __init__.py                  # Test package marker
├── test_smoke.py                # Basic project smoke test
└── test_*.py                    # Focused tests for package modules
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
- Prefer a domain-oriented package structure for new code (`config/`, `history/`, `exercise/`, `recording/`, `analysis/`) instead of a project-wide `api/`, `services/`, `models/` split; add per-domain `api.py`, `models.py`, and `service.py` only where that boundary is useful, while shared persisted boundary models may remain under `storage/`
- Keep `__init__.py` files empty by default
- Avoid routine re-export boilerplate and duplicated `__all__` declarations in `__init__.py`
- Prefer typed Python code, small modules, and explicit data models for API and storage boundaries
- Keep application logic separated from storage, Gemini integration, and HTTP handlers
- Add tests with `pytest` for storage, state transitions, and response normalization as code appears

## Testing Guidelines

- Prefer focused, high-value tests over chasing coverage for its own sake
- Cover each meaningful behavior with a clear happy path
- Add obvious edge and error cases where behavior is easy to get wrong or important to preserve
- Prefer parametrized tests when they reduce repetition without hiding intent
- Add narrower regression tests when real bugs appear instead of preemptively testing every branch
- Avoid noisy or fragile tests that make routine maintenance harder than the behavior is worth

## Configuration

- Store local runtime data under `~/.sayclearly/`
- Keep user secrets out of git; use local config or runtime input for Gemini API keys
- Optional telemetry is controlled by `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST`
- Ignore only local AI overrides: `.claude/**/*.local.*` and `CLAUDE.local.md`

## Development Notes

- The repository already includes the local app entry point and initial domain packages; keep new work aligned with the documented package layout above
- Use the configured Context7 documentation workflow for current library/framework references; do not rely on undeclared local helper CLIs
- Keep the MVP local-only: no remote backend, no shared key storage, no long-term audio retention by default
