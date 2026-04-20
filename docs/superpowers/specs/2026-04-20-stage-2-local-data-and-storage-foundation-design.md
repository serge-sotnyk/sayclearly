# Stage 2 Local Data And Storage Foundation Design

## Summary

Stage 2 adds the local persistence foundation under `~/.sayclearly/` and exposes the first storage-backed API contracts needed by later phases.
The goal is to make configuration, secrets, history, and cache management reliable before the product flow, Gemini integration, and browser state machine arrive.

This stage intentionally stops at local storage and thin backend APIs. It does not implement the guided exercise flow, recording, text generation, audio analysis, or review UI.

## Goals

- create and own the local application data tree under `~/.sayclearly/`;
- persist versioned configuration, secrets, and history structures as JSON;
- keep secrets out of browser responses while still exposing useful status fields;
- support environment variable overrides at read time for development and deployment convenience;
- provide thin backend endpoints for config and history without coupling HTTP handlers to file I/O;
- enforce atomic writes and history trimming so local persistence is dependable.

## Out Of Scope

Stage 2 does not include:

- real Gemini text generation or audio analysis;
- microphone recording, upload handling, or audio cleanup workflows;
- the home/setup UI, settings UI, history UI, or browser state machine;
- Langfuse runtime integration beyond storing and reading relevant configuration shape;
- speculative provider-specific services beyond storage-backed configuration access;
- automatic discovery or editing of `.env` files on disk.

## Design Principles

- Keep app-owned persistence canonical under `~/.sayclearly/`.
- Separate secret and non-secret values in storage, but keep the HTTP config contract unified.
- Apply environment variables as effective read-time overrides only; never write back to env.
- Keep route handlers thin and move file logic into focused storage and service modules.
- Use versioned JSON documents from the start so later migrations stay explicit.
- Fail clearly on malformed local files instead of silently guessing how to repair them.
- Prefer focused, high-value tests over exhaustive coverage for its own sake.

## Filesystem Layout

Stage 2 introduces and owns this local filesystem layout:

```text
~/.sayclearly/
  config.json
  secrets.json
  history.json
  cache/
```

Rules:

- `~/.sayclearly/` is created on first storage access if missing.
- `cache/` is created on first storage access if missing.
- `config.json`, `secrets.json`, and `history.json` are created lazily with default versioned content if missing.
- The application manages only this tree and does not scan the working directory or parent directories for `.env` files.

## Module Boundaries

### `src/sayclearly/app.py`

Responsibility: FastAPI application assembly.

This module remains the app factory and wires in the new config and history routes while preserving the existing root page and health endpoint.

### Storage modules

Responsibility: filesystem and JSON persistence details.

This layer should handle:

- resolving the application data root;
- ensuring directories and default files exist;
- reading and writing versioned JSON documents;
- atomic file replacement;
- raising controlled errors when local files are malformed or unwritable.

The storage layer should not contain HTTP concerns or UI-facing response shaping.

### Typed models

Responsibility: stable in-process data structures for config, secrets, history, and API payloads.

Stage 2 should introduce typed models for:

- stored non-secret configuration;
- stored secrets;
- history container and history session entries;
- public config response payloads;
- config update request payloads.

### `config_service`

Responsibility: app-level configuration behavior over split storage files.

This service should:

- read `config.json` and `secrets.json`;
- apply environment variable overrides to produce the effective configuration;
- expose a unified public config view for the API;
- update stored config and stored secrets through one application boundary;
- clear the stored Gemini API key without affecting environment overrides.

### `history_service`

Responsibility: application behavior for recent session storage.

This service should:

- read current history;
- save a normalized session entry;
- enforce newest-first ordering;
- trim history to the configured session limit;
- return one session by id or report that it does not exist.

### Route modules

Responsibility: HTTP transport only.

Routes should validate requests, call services, translate application errors into HTTP responses, and return the agreed JSON contracts. They should not open files directly.

## Stored Data Structures

Each storage file contains its own top-level `version: 1` field.

### `config.json`

This file stores non-secret, app-owned settings. Stage 2 should include at least:

```json
{
  "version": 1,
  "text_language": "uk",
  "analysis_language": "uk",
  "ui_language": "en",
  "same_language_for_analysis": true,
  "last_topic_prompt": "",
  "session_limit": 300,
  "keep_last_audio": false,
  "gemini": {
    "model": "gemini-2.5-flash"
  },
  "langfuse": {
    "host": null
  }
}
```

### `secrets.json`

This file stores credential-like values only. Stage 2 should support this shape:

```json
{
  "version": 1,
  "gemini": {
    "api_key": "..."
  },
  "langfuse": {
    "public_key": "...",
    "secret_key": "..."
  }
}
```

If a secret is absent, the field should be omitted rather than filled with an empty string.

### `history.json`

This file stores recent sessions in newest-first order:

```json
{
  "version": 1,
  "sessions": []
}
```

Session entries follow the MVP contract shape already described in the spec, including normalized analysis fields used later by review and history screens.

## Effective Configuration Model

The API should expose one unified config contract even though storage is split between `config.json` and `secrets.json`.

`GET /api/config` returns effective non-secret values plus secret status fields.

Example response:

```json
{
  "version": 1,
  "text_language": "uk",
  "analysis_language": "uk",
  "same_language_for_analysis": true,
  "ui_language": "en",
  "last_topic_prompt": "",
  "session_limit": 300,
  "keep_last_audio": false,
  "gemini": {
    "model": "gemini-2.5-flash",
    "has_api_key": false,
    "api_key_source": "none"
  },
  "langfuse": {
    "host": null,
    "enabled": false,
    "has_public_key": false,
    "has_secret_key": false,
    "public_key_source": "none",
    "secret_key_source": "none"
  }
}
```

Rules:

- secret values are never returned to the browser;
- `*_source` indicates whether the effective value comes from `env`, `stored`, or `none`;
- `langfuse.enabled` is a derived field based on the effective settings available at read time.

## Environment Override Rules

Environment variables are supported as read-time overrides for effective configuration.

Stage 2 should recognize these environment variables:

- `GEMINI_API_KEY` for `gemini.api_key`;
- `LANGFUSE_PUBLIC_KEY` for `langfuse.public_key`;
- `LANGFUSE_SECRET_KEY` for `langfuse.secret_key`;
- `LANGFUSE_HOST` for `langfuse.host`.

Read priority:

1. environment variables;
2. stored app-owned values in `config.json` or `secrets.json`;
3. defaults.

Write priority is different:

- config update endpoints write only to app-owned files;
- the application never writes to environment variables;
- deleting a stored secret does not remove an effective value coming from the environment.

This preserves a predictable app-owned storage model while still allowing convenient development-time overrides.

Stage 2 should not search the filesystem for `.env` files and should not rewrite any `.env` file.

## API Contracts

### `GET /api/config`

Returns the effective public configuration view described above.

### `POST /api/config`

Accepts a unified config update payload containing non-secret settings and optional secret values.

Rules:

- non-secret values are written to `config.json`;
- provided secret values are written to `secrets.json`;
- secret values are not echoed back in responses;
- `null` for a secret field does not implicitly clear it;
- unknown fields are rejected with `400`.

### `DELETE /api/config/api-key`

Stage 2 keeps the spec-compatible Gemini-specific endpoint.

Behavior:

- remove only the stored `gemini.api_key` value from `secrets.json`;
- return success even if no stored key exists;
- leave any environment override untouched.

### `GET /api/history`

Returns the recent history container with sessions in newest-first order.

### `GET /api/history/{session_id}`

Returns one history session or `404` if it does not exist.

### `POST /api/history`

Accepts an already normalized session entry and persists it into `history.json`.

Stage 2 provides the storage contract only. It does not yet generate sessions from the real product flow.

## Atomic Write Rules

Every write to `config.json`, `secrets.json`, and `history.json` must be atomic.

Required behavior:

1. serialize the full JSON document;
2. write it to a temporary file in the same directory as the target;
3. replace the target file with the temporary file.

Writing in the same directory avoids cross-filesystem rename issues and keeps replacement semantics predictable.

## History Rules

History behavior for Stage 2:

- store at most `session_limit` sessions;
- default `session_limit` is `300`;
- insert new sessions at the front of the list;
- trim excess sessions from the tail;
- return an empty valid history structure when no history exists yet.

The configured session limit is stored in `config.json`, but the history service is responsible for enforcing it at save time.

## Error Handling

Stage 2 should prefer simple, explicit failures.

- malformed app-owned JSON files return `500` with a clear local storage error message;
- inability to create directories or write files returns `500`;
- invalid request payload shape or unknown fields returns `400`;
- missing history entries return `404`.

Stage 2 does not attempt silent repair of corrupted local files.

## Testing Strategy

Stage 2 should use a pragmatic testing approach:

- cover each meaningful storage, service, and API behavior with a clear happy path;
- add obvious edge and error cases where behavior is easy to get wrong or important to preserve;
- prefer parametrized tests when they reduce repetition without hiding intent;
- do not chase exhaustive per-method or 100 percent coverage if that would make tests noisy or fragile;
- add narrower regression tests later when real bugs appear.

### Storage tests

Add storage-level tests for:

- creating the storage tree and default files on first use;
- returning default versioned structures when files are missing;
- atomic replacement write behavior;
- surfacing malformed JSON as controlled application errors;
- history trimming to the configured limit;
- deleting only the stored Gemini key.

### Service tests

Add service-level tests for:

- merging config, secrets, and environment overrides into one public config view;
- exposing only `has_*` and `*_source` for secrets;
- updating stored config and stored secrets through one service boundary;
- preserving effective env-based secret availability after stored secret deletion;
- deriving `langfuse.enabled` consistently from effective settings.

### API tests

Add API tests for:

- `GET /api/config` returning the public config contract;
- `POST /api/config` persisting changes across app recreation;
- `DELETE /api/config/api-key` clearing only the stored Gemini key;
- `GET /api/history`, `GET /api/history/{session_id}`, and `POST /api/history` following the agreed contract;
- `GET /api/health` remaining unchanged.

### Manual verification

Stage 2 is manually verified when:

- first use creates `~/.sayclearly/`, `config.json`, `secrets.json`, `history.json`, and `cache/`;
- config changes persist across restart;
- a stored Gemini key can be cleared cleanly;
- history is written atomically and trimmed to the configured limit;
- environment overrides win at read time without changing stored files.

## Completion Criteria

Stage 2 is complete when all of the following are true:

- the application owns a reliable local storage tree under `~/.sayclearly/`;
- config, secrets, and history use versioned JSON documents;
- storage writes are atomic;
- the backend exposes working config and history APIs;
- secrets are never returned in API responses;
- stored config survives restart;
- history trimming is enforced;
- tests cover storage, service, and API behavior needed by later stages.

## Exit Criteria For This Stage

If the app can create its local storage foundation, persist config and history reliably, clear a stored Gemini key, and expose those behaviors through backend APIs without leaking secrets, Stage 2 is done.

If implementation starts adding the guided browser flow, recording logic, Gemini calls, Langfuse instrumentation behavior, or history UI, the work has crossed into later stages and should stop.
