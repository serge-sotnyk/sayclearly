# Stage 5 Exercise Text Generation With Gemini Design

## Summary

Stage 5 replaces the placeholder exercise generator with real Gemini-backed text generation.
The goal is to deliver useful, fresh reading exercises through the existing UI while keeping the current guided flow intact and preparing the settings model for Stage 6 audio analysis.

This stage keeps the current FastAPI, plain TypeScript, and local-storage architecture. The backend adds a narrow Gemini integration boundary for structured exercise generation, reads recent local history to reduce repetition, and instruments text-generation calls with Langfuse when the required environment variables are present.

## Goals

- replace the placeholder exercise text with real Gemini output;
- keep the current `POST /api/generate-text` flow and guided frontend experience;
- generate exercises in the selected text language and respect an optional topic;
- continue supporting `reuse_last_topic` from the stored config;
- reduce close repetition by including recent local exercise context in the prompt;
- normalize model output into the existing application response shape;
- add model-selection settings now so Stage 6 can reuse them for audio analysis later;
- add Langfuse instrumentation for text-generation calls when configured;
- support convenient local development through environment-based defaults and API keys.

## Out Of Scope

Stage 5 does not include:

- real Gemini-backed audio analysis;
- use of the selected analysis model in runtime behavior;
- a general-purpose Gemini playground in the UI;
- exposing temperature, top-p, top-k, or schema controls as user-facing settings;
- dynamic retrieval of available models from Gemini at runtime;
- hard rejection of outputs based on an exact sentence count.

## Design Principles

- Preserve the existing Stage 3 and Stage 4 browser flow instead of reworking the guided exercise shell.
- Keep Gemini-specific code outside HTTP handlers and outside generic storage helpers.
- Use structured JSON output from Gemini and validate it before returning anything to the UI.
- Treat `5-8 sentences` as a prompt target, not as a strict acceptance gate.
- Add only the smallest useful settings surface for the MVP.
- Make Langfuse additive: telemetry must never become a runtime blocker for generation.
- Keep development convenience in `.env` and keep product behavior based on local config and stored secrets.

## User Flow Boundary

Stage 5 should cover this path:

1. The user opens the existing home or setup screen.
2. The user can set:
   - exercise text language;
   - analysis language;
   - topic;
   - `reuse last topic`;
   - text generation model;
   - analysis model;
   - `Use the same model for analysis`;
   - text thinking level.
3. The user clicks `Generate exercise`.
4. The frontend sends the generation request through the existing route.
5. The backend resolves the effective topic, effective text model, thinking level, and recent-text context.
6. The backend calls Gemini with structured output enabled.
7. The backend validates and normalizes the result.
8. The frontend receives a real generated exercise and continues the existing guided reading flow.

This stage intentionally stops before real runtime use of the chosen analysis model. That setting is added now so the configuration shape does not need a second redesign in Stage 6.

## Configuration Model

The current single `gemini.model` field is no longer sufficient.
Stage 5 should expand the persisted Gemini configuration so the application can separately store text-generation and analysis preferences.

### Stored Gemini settings

The stored config should include:

- `text_model`;
- `analysis_model`;
- `same_model_for_analysis`;
- `text_thinking_level`.

The analysis-model fields are configuration-only in Stage 5. They do not change any runtime analysis behavior yet.

### Effective defaults

Product defaults:

- `text_model`: `gemini-3-flash`;
- `analysis_model`: `gemini-3-flash`;
- `same_model_for_analysis`: `true`;
- `text_thinking_level`: `high`;
- `temperature`: fixed internally at `1`.

Development overrides should be supported through environment variables so local development can start with a cheaper default model without editing saved config by hand.

Recommended overrides:

- `GEMINI_API_KEY`;
- `LANGFUSE_PUBLIC_KEY`;
- `LANGFUSE_SECRET_KEY`;
- `LANGFUSE_HOST`;
- `SAYCLEARLY_DEFAULT_TEXT_MODEL`;
- `SAYCLEARLY_DEFAULT_ANALYSIS_MODEL`.

For local development, the intended default text model is `gemini-3.1-flash-lite-preview`.

## Model Catalog

The application should expose a static catalog of allowed Gemini models instead of accepting arbitrary model IDs from the UI.

Each catalog entry should include:

- display label for the settings UI;
- exact Gemini model ID used by the SDK;
- a short note about the free-tier RPD when known;
- enough metadata to identify the recommended default in product and development contexts.

The catalog should be stored in application code, not fetched dynamically.
This keeps the MVP predictable and avoids introducing a second integration for model discovery.

Important constraint:

- do not trust visual names copied from AI Studio tables as exact API identifiers;
- use exact Gemini SDK model IDs without spaces;
- verify the final catalog against current Gemini documentation or generated SDK examples before planning and implementation.

## Generation Settings Surface

The UI should expose only the settings that are product-relevant for the MVP.

### Visible settings

- `Text generation model`;
- `Analysis model`;
- `Use the same model for analysis`;
- `Thinking level`.

`Thinking level` should live in an advanced settings area rather than the main setup form.
Its default value should be `high`.

### Hidden internal settings

The following should stay internal to the backend integration:

- `temperature = 1`;
- structured JSON output enabled;
- response schema;
- system instruction;
- output-token limit;
- any stop sequences or sampling details beyond the fixed MVP baseline.

This keeps the settings surface from turning into a generic model playground and makes exercise quality easier to reason about.

## Request And Response Contract

The existing route should stay in place:

- `POST /api/generate-text`

The route can keep the current request shape if the backend can resolve the effective text-generation settings from saved config.
If an explicit model or thinking-level field needs to be carried in the request for correctness of the current frontend flow, that is acceptable, but the public API should remain compact and centered on the exercise-generation use case rather than exposing raw provider config.

The response shape should remain aligned with the current application contract:

- `language`;
- `analysis_language`;
- `topic_prompt`;
- `text`.

This keeps Stage 5 compatible with the current frontend flow and avoids unnecessary UI restructuring.

## Prompt Design

The backend should build the Gemini request from two layers.

### System instruction

Responsibility:

- define the exercise-writing behavior;
- enforce calm, practical diction-training intent;
- require structured JSON output only;
- instruct the model to avoid repeating recent texts too closely;
- keep the content suitable for reading aloud and later retelling.

This instruction is product logic and should stay in code, not in user-editable settings.

### User prompt

Responsibility:

- pass the target text language;
- pass the optional topic when present;
- include a compact recent-history context when available;
- state the target shape of the exercise text.

The prompt should ask for roughly `5-8 sentences`, but the backend should treat that as a target rather than an exact hard validation rule.

## Recent-Text Awareness

The backend should read a small slice of recent local history and provide it to the prompt to reduce repetition.

The design should stay intentionally soft:

- do not attempt semantic similarity scoring;
- do not block generation on a repetition heuristic;
- include several recent texts or short excerpts and tell the model not to repeat them too closely.

If history cannot be read for a non-fatal reason specific to recent-text context, the generation request may continue without that context.
The application should not fail the whole generation flow merely because repetition-reduction context is unavailable.

## Backend Module Boundaries

### `src/sayclearly/exercise/service.py`

Responsibility:

- resolve the effective topic;
- resolve effective generation settings;
- collect recent-text context;
- call the Gemini boundary;
- validate and normalize the returned payload;
- map provider-level failures into calm application-level errors.

This module should stop generating placeholder text entirely.

### `src/sayclearly/exercise/prompts.py`

Responsibility:

- build the system instruction;
- build the user prompt content for exercise generation.

Keeping prompt construction separate will make Stage 5 easier to test and Stage 6 easier to mirror for audio analysis.

### `src/sayclearly/gemini/catalog.py`

Responsibility:

- define the supported Gemini model catalog;
- expose exact model IDs plus UI metadata such as free-tier RPD hints.

### `src/sayclearly/gemini/client.py`

Responsibility:

- create and own the Google Gen AI SDK client;
- call Gemini with a structured response schema;
- set fixed generation config such as `temperature=1`;
- pass the selected model and thinking configuration;
- return typed results or typed provider errors.

### `src/sayclearly/gemini/telemetry.py`

Responsibility:

- wrap text-generation calls with Langfuse when environment variables are present;
- degrade cleanly to no-op behavior when telemetry is not configured;
- avoid surfacing telemetry failures as generation failures when the underlying generation call succeeds.

### `src/sayclearly/config/service.py`

Responsibility:

- assemble the effective public config including the expanded Gemini settings;
- expose the allowed model catalog to the frontend;
- apply environment-based defaults for development convenience.

### `src/sayclearly/config/models.py` and `src/sayclearly/storage/models.py`

Responsibility:

- persist and expose the expanded Gemini settings shape;
- add any public view models needed for the model catalog and thinking-level settings.

## Gemini Integration Shape

The Google Gen AI SDK should be used through one narrow client boundary.

The generation call should use:

- the selected model ID;
- the generated prompt content;
- `temperature=1`;
- the selected thinking level;
- JSON response MIME type;
- a response schema describing the expected structured exercise payload.

Structured output should always be on internally.
It should not appear as a user-facing toggle.

The backend should use the non-streaming generation path for this stage so normalization and error handling stay simple.

## Langfuse Instrumentation

Stage 5 should add Langfuse coverage for text-generation calls.

Behavior:

- if `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` are present, generation calls are instrumented;
- if they are absent, the application behaves normally without telemetry;
- if telemetry submission fails but Gemini generation succeeds, the user should still get the generated exercise.

This keeps observability aligned with the product spec while preserving local reliability.

## Frontend Composition

### Settings UI

`src/sayclearly/templates/index.html` and the existing frontend state should expand the settings surface with:

- `Text generation model`;
- `Analysis model`;
- `Use the same model for analysis`;
- `Thinking level`.

The model selector should show a human-readable title plus a short free-tier RPD hint where known.

Preferred wording for the checkbox:

- `Use the same model for analysis`

When the checkbox is enabled:

- the analysis-model control should be visually disabled or hidden;
- the frontend should continue storing a coherent config shape;
- the backend should treat the effective analysis model as the text model.

### Frontend state behavior

The TypeScript app state should:

- load the expanded config shape from the backend;
- save the expanded config shape back through the existing config API;
- preserve user inputs when generation fails;
- keep generation errors inline on the setup screen;
- avoid resetting the current topic or model choices after a failed attempt.

The overall reading and recording flow should remain structurally unchanged.

## Validation And Error Handling

### Validation

The backend should reject results when they fail meaningful product-level checks, such as:

- empty text;
- missing required structured fields;
- obvious non-exercise output such as markdown fences or raw service wrappers;
- invalid structured JSON shape.

The backend should not reject an otherwise useful result solely because the model produced slightly fewer or more than the target number of sentences.

### Error handling

If the Gemini API key is missing:

- return a calm application-level error;
- keep the user on the setup screen;
- preserve all entered settings.

If Gemini rejects the request or the provider fails:

- map the failure into a short user-facing message;
- avoid exposing raw provider internals in the frontend response.

If Langfuse fails:

- do not fail the whole generation request unless the Gemini call itself also failed.

## Development `.env` Support

For local development, the repository may include an untracked `.env` file at the project root.

Recommended behavior:

- `.env` is for local developer convenience only;
- `.env.example` should document supported variables without including secrets;
- the real `.env` file should remain ignored by git;
- persisted local config and secrets remain the product-facing storage path.

This lets development use environment-based keys and default-model overrides while preserving the intended end-user behavior of the local application.

## Testing Strategy

Stage 5 should add focused tests at four levels.

### Prompt and normalization tests

- topic resolution;
- recent-text prompt context shaping;
- structured response validation;
- non-empty text normalization;
- rejection of clearly malformed or wrapped model output.

### Service tests

- missing Gemini API key;
- successful Gemini generation;
- invalid structured provider output;
- generation without recent-history context when that context is unavailable.

### API tests

- successful `POST /api/generate-text`;
- calm error for missing API key;
- calm error for Gemini-side failure;
- request-validation behavior remains aligned with the current API pattern.

### Frontend tests

- expanded settings load and save correctly;
- `Use the same model for analysis` toggles dependent UI behavior correctly;
- generation errors remain inline without clearing user-entered values.

## Verification Criteria

Stage 5 is complete when:

- generating an exercise from the UI returns a real Gemini-generated text;
- the result reflects the chosen language and optional topic;
- the backend returns normalized application output rather than raw model output;
- the settings UI exposes model selection and thinking level as designed;
- text-generation calls are instrumented when Langfuse environment variables are present;
- local development can use `.env`-based keys and default-model overrides without changing committed repository state.
