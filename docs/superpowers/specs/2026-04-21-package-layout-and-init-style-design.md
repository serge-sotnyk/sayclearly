# Package Layout And Init Style Design

## Summary

This design defines the long-term module layout for SayClearly after Stage 2 and before the larger UI, recording, and analysis stages arrive.
The goal is to move from flat top-level modules toward a domain-oriented package structure that stays readable as `config`, `history`, `exercise`, `recording`, and `analysis` grow.

It also records the preferred style for `__init__.py` files: keep them empty by default, avoid routine `__all__` duplication, and rely on targeted Ruff configuration instead of noisy re-export boilerplate.

## Goals

- adopt a package layout that can continue through the next implementation stages;
- organize code primarily by domain rather than by global technical layer;
- keep HTTP transport, domain logic, and storage responsibilities clearly separated;
- avoid `__init__.py` boilerplate that exists only to satisfy linting;
- record where these rules belong so architectural decisions and repo-wide style rules do not get mixed together.

## Out Of Scope

This design does not define the internal logic of future `exercise`, `recording`, or `analysis` modules.
It also does not require an immediate large refactor of unrelated files or a new architectural abstraction layer such as `domains/` or `infrastructure/`.

## Recommended Structure

The recommended long-term structure is:

```text
src/sayclearly/
  app.py
  main.py
  web/
    errors.py
  config/
    api.py
    models.py
    service.py
  history/
    api.py
    models.py
    service.py
  storage/
    files.py
    models.py
```

As later stages arrive, the package grows by domain:

```text
src/sayclearly/
  app.py
  main.py
  web/
    errors.py
  config/
    api.py
    models.py
    service.py
  history/
    api.py
    models.py
    service.py
  exercise/
    api.py
    models.py
    service.py
  recording/
    api.py
    service.py
  analysis/
    api.py
    models.py
    service.py
  storage/
    files.py
    models.py
```

## Module Responsibilities

### `app.py`

Responsibility: assemble the FastAPI application.

This module should stay small. It wires routers, shared exception handlers, static assets, and top-level application setup. It should not contain domain behavior or file I/O.

### `main.py`

Responsibility: CLI startup only.

This module should continue to handle only localhost startup, browser opening, and process launch behavior.

### `web/errors.py`

Responsibility: shared FastAPI exception handling.

Current logic such as the `400` versus `422` request validation mapping belongs here rather than growing inside `app.py`.

### Domain packages (`config/`, `history/`, later `exercise/`, `recording/`, `analysis/`)

Each domain package should own its local concerns:

- `api.py`: HTTP transport and request/response mapping only;
- `service.py`: domain rules and orchestration;
- `models.py`: typed models that belong to that domain.

Domain packages should not import each other's `api.py` modules. Cross-domain interaction should happen through services or shared storage interfaces.

### `storage/`

Responsibility: persistence primitives that are shared across domains.

- `files.py`: low-level filesystem operations, root resolution, atomic writes, JSON load/save helpers;
- `models.py`: persisted storage models that are shared at the storage boundary.

The storage package should not know about FastAPI.

## Recommended Refactor Of Current Stage 2 Code

The current flat Stage 2 files map naturally into the recommended structure:

- `src/sayclearly/config_api.py` -> `src/sayclearly/config/api.py`
- `src/sayclearly/config_models.py` -> `src/sayclearly/config/models.py`
- `src/sayclearly/config_service.py` -> `src/sayclearly/config/service.py`
- `src/sayclearly/history_api.py` -> `src/sayclearly/history/api.py`
- `src/sayclearly/history_service.py` -> `src/sayclearly/history/service.py`
- `src/sayclearly/storage.py` -> `src/sayclearly/storage/files.py`
- `src/sayclearly/storage_models.py` -> `src/sayclearly/storage/models.py`

The current validation-error handler in `app.py` should move into `src/sayclearly/web/errors.py` once the refactor happens.

No additional package should be created unless it already has a clear purpose. For example, introducing `domains/` or `infrastructure/` now would add ceremony without helping the current codebase.

## `__init__.py` Style

Default rule: keep `__init__.py` files empty.

The project should not use routine `__all__` declarations or duplicated re-export imports as a default style. In most cases they add maintenance noise without improving the real package API.

Allowed usage:

- empty `__init__.py` files to mark packages;
- occasional direct re-exports when they clearly simplify external imports and are intentionally part of the package interface.

Avoid:

- `__all__` declarations that only duplicate already imported names;
- package-level initialization logic unless there is a real startup concern that belongs in a separate explicit module.

## Where Rules Belong

These rules should be recorded in three different places depending on their role.

### Architectural/package decision

The package layout decision belongs in a short design note under `docs/superpowers/specs/` because it is a structural decision about how the codebase should evolve.

### Repo-wide style guidance

The `__init__.py` preference belongs in `AGENTS.md` because it is an engineering style rule that should apply across future stages.

### Tool enforcement

The lint configuration that supports this style belongs in `pyproject.toml`.

Recommended Ruff addition:

```toml
[tool.ruff.lint.per-file-ignores]
"**/__init__.py" = ["F401"]
```

This allows intentional package re-exports without forcing `__all__` noise.

## Design Principles

- Organize by domain first, not by global technical layer.
- Keep `app.py` and `main.py` as stable top-level entry points.
- Keep common HTTP concerns in `web/`, but keep that package thin.
- Put low-level persistence code in `storage/`, but avoid turning it into a dumping ground for unrelated shared code.
- Prefer a small number of obvious packages over a deeper abstract architecture introduced too early.

## Completion Criteria

This design is successful when future stages can add new product areas under their own domain packages without forcing a broad structural rewrite, and when package boilerplate stays small enough that navigation is simpler rather than noisier.
