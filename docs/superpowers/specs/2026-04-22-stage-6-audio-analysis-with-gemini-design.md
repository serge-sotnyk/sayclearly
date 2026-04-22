# Stage 6 Audio Analysis with Gemini Design

## Summary

Stage 6 replaces the placeholder recording analysis stub with real Gemini-backed audio analysis. The backend accepts an uploaded audio recording plus session metadata, sends the audio to Gemini for structured analysis, normalizes the model response into the existing UI format, and returns compact, practical feedback.

The frontend continues to use the existing review screen shape; the backend maps structured model output into text fields that match the current `RecordingAnalysisResponse` contract.

## Goals

- Replace the stub `RecordingService.analyze_recording` with real Gemini audio analysis.
- Accept multipart upload: audio file + metadata (language, analysis_language, exercise text).
- Resolve the effective analysis model and API key from the existing Stage 5 config/secrets.
- Send audio inline to Gemini with a structured JSON output schema.
- Normalize the Gemini response into the existing UI `RecordingAnalysisResponse` format.
- Add Langfuse instrumentation for audio-analysis calls when environment variables are present.
- Keep the current frontend review panel structure unchanged.
- Provide calm, human-friendly error handling for missing key, invalid key, empty recording, and Gemini-side failures.

## Out Of Scope

Stage 6 does not include:

- Saving analysis results to history (Stage 7).
- Changing the history storage schema.
- Adding a new domain package; work stays inside the existing `recording/` boundary.
- Real-time analysis during recording.
- Comparison with a reference recording.
- Long-term audio retention beyond the existing temporary-file behavior.

## Design Principles

- Follow the same backend boundary pattern established in Stage 5 (`exercise/` = service + prompts + models).
- Keep Gemini-specific code outside HTTP handlers.
- Use structured JSON output from Gemini and validate it before returning anything to the UI.
- Make Langfuse additive: telemetry must never become a runtime blocker for analysis.
- Preserve the current frontend review UI without structural changes.
- Keep error messages calm and free of technical panic.

## User Flow Boundary

Stage 6 covers this path:

1. The user completes Steps 1–3 of the guided exercise.
2. The user records a retelling in the browser.
3. The user clicks **Analyze**.
4. The frontend uploads the audio plus metadata (language, analysis_language, exercise text) as a multipart request.
5. The backend saves the audio temporarily, resolves the effective analysis model and API key, builds the analysis prompt, and sends the audio to Gemini.
6. Gemini returns structured JSON.
7. The backend validates and normalizes the result into the existing UI response shape.
8. The frontend displays the review panel with summary, clarity, pace, hesitations, and recommendations.

## Request And Response Contract

### `POST /api/analyze-recording`

Multipart request fields:

- `audio` — `UploadFile` (the recorded audio blob)
- `metadata` — JSON string with the shape:

```json
{
  "language": "uk",
  "analysis_language": "uk",
  "exercise_text": "Generated exercise text..."
}
```

The `metadata` field is a single form field containing a JSON string. This keeps the endpoint a standard multipart upload while carrying the required session context.

Response (unchanged from Stage 4):

```json
{
  "summary": "The pace noticeably increased near the end.",
  "clarity": "Most words are understandable, but several consonants need firmer shaping.",
  "pace": "The pace is mostly even, though a few phrases rush at the end.",
  "hesitations": ["A short pause appears before one of the longer phrases."],
  "recommendations": ["Repeat the passage once more with slightly slower sentence endings."]
}
```

### Internal Structured Gemini Output

The model is asked to return:

```json
{
  "clarity_score": 72,
  "pace_score": 65,
  "hesitations": [
    {"start": 12.4, "end": 13.1, "note": "short restart"}
  ],
  "summary": [
    "Tempo increased near the end",
    "Some phrase endings became less clear"
  ],
  "recommendations": [
    "If you slow down a little, the speech will become clearer."
  ]
}
```

The backend maps this into the UI-facing `RecordingAnalysisResponse`:

- `summary` → joined summary bullets as a single paragraph, or the first item if only one.
- `clarity` → a short text derived from `clarity_score` and summary context (gentle phrasing, no raw scores).
- `pace` → a short text derived from `pace_score` and summary context.
- `hesitations` → array of human-readable strings, each containing the note and optionally the timestamp.
- `recommendations` → passed through directly.

The exact mapping strategy is intentionally soft: the goal is gentle, practical text rather than rigid score-to-text conversion.

## Backend Module Boundaries

### `src/sayclearly/recording/models.py`

Responsibilities:

- `AudioAnalysisMetadata` — validated multipart metadata payload.
- `StructuredAudioAnalysis` — Pydantic model for the structured Gemini response.
- `RecordingAnalysisResponse` — existing UI response model (no changes).

### `src/sayclearly/recording/prompts.py` (new)

Responsibilities:

- Build the system instruction for audio analysis.
- Build the user prompt that carries language, analysis_language, and exercise_text.

### `src/sayclearly/recording/service.py`

Responsibilities:

- Save the uploaded audio to a temporary file.
- Resolve the effective analysis model from config.
- Resolve the Gemini API key from secrets/env.
- Build the analysis prompt via `recording/prompts.py`.
- Call `GeminiClient.analyze_audio()` passing the original `content_type` (e.g. `audio/webm`) so Gemini receives the correct MIME type.
- Validate and normalize the structured response into `RecordingAnalysisResponse`.
- Map provider-level failures into calm application-level errors.

### `src/sayclearly/recording/api.py`

Responsibilities:

- Accept multipart upload (`audio` + `metadata`).
- Parse and validate `AudioAnalysisMetadata`.
- Pass audio bytes, original `content_type`, and metadata to `RecordingService.analyze_recording()`.
- Map service errors into appropriate HTTP status codes.

### `src/sayclearly/gemini/client.py`

Responsibilities:

- Own the new `analyze_audio()` method.
- Accept audio bytes, MIME type, system instruction, prompt, model, and thinking level.
- Send audio inline using `types.Part.from_bytes(data=audio_bytes, mime_type=content_type)` alongside the text prompt.
- Call Gemini with structured JSON output enabled.
- Return `StructuredAudioAnalysis` or raise typed provider errors.

Implementation detail from the Google Gen AI SDK:

```python
from google.genai import types

response = client.models.generate_content(
    model=model_id,
    contents=[
        types.Part.from_bytes(data=audio_bytes, mime_type=content_type),
        prompt,
    ],
    config=types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=1,
        response_mime_type="application/json",
        response_json_schema=StructuredAudioAnalysis.model_json_schema(),
        thinking_config=...,
    ),
)
```

Supported audio MIME types include `audio/webm`, `audio/wav`, `audio/mp3`, `audio/ogg`, `audio/flac`, and others supported by the Gemini model. The backend should pass through the `content_type` received from the frontend upload.

### `src/sayclearly/gemini/telemetry.py`

Responsibilities:

- Add `start_audio_analysis()` analogous to `start_text_generation()`.
- Cover all audio-analysis calls when Langfuse env vars are present.
- Degrade cleanly to no-op when telemetry is not configured.

## Prompt Design

### System instruction

```
You are a diction and speech clarity coach.
Analyze the provided audio recording of a spoken retelling.
Focus on:
- speech clarity and articulation
- speaking pace and rhythm
- hesitations, pauses, and restarts
- blurred or swallowed word endings
- speeding up or loss of control near the end

Provide gentle, practical feedback.
Avoid harsh evaluative wording such as "bad," "poor," or numeric scores like "4/10."
Return JSON only. Do not add markdown fences or extra commentary.
```

### User prompt

```
The speaker retold the following exercise text.

Language spoken: {language}
Feedback language: {analysis_language}

Exercise text:
{exercise_text}

Analyze the audio and return a JSON object with:
- clarity_score: integer 0-100
- pace_score: integer 0-100
- hesitations: array of objects with {start: number (seconds), end: number (seconds), note: string}
- summary: array of short, gentle observations
- recommendations: array of 2-4 practical, encouraging suggestions
```

## Error Handling

### Missing API key

- Service raises `ExerciseServiceConfigurationError` equivalent.
- API returns HTTP 400 with calm message: "Gemini API key is required before analyzing recordings."

### Invalid API key

- Service raises `GeminiInvalidCredentialsError` equivalent.
- API returns HTTP 400 with: "Gemini API key was rejected. Update it and try again."

### Empty recording

- Already handled in Stage 4.
- Service raises `EmptyRecordingError`.
- API returns HTTP 400.

### Gemini provider failure

- Service raises `GeminiProviderError` equivalent.
- API returns HTTP 502 with: "Analysis is unavailable right now. Please try again."

### Malformed model response

- Service raises `GeminiMalformedResponseError` equivalent.
- API returns HTTP 502 with: "Analysis did not complete. Try again."

### Langfuse failure

- Telemetry failures are swallowed; the user still receives analysis if Gemini succeeds.

## Frontend Changes

### `src/sayclearly/static/app.ts`

Changes:

- When building the FormData for `/api/analyze-recording`, append a `metadata` field:
  ```typescript
  const metadata = JSON.stringify({
    language: model.generated_exercise.language,
    analysis_language: model.generated_exercise.analysis_language,
    exercise_text: model.generated_exercise.text,
  });
  formData.append('metadata', metadata);
  ```
- No changes to the review panel rendering or response parsing; the response shape stays the same.

### `src/sayclearly/static/app_state.ts`

- No changes required.

### `src/sayclearly/templates/index.html`

- No changes required.

## Testing Strategy

### Prompt tests (`tests/test_recording_prompts.py`)

- Prompt includes language, analysis_language, and exercise_text.
- System instruction mentions JSON and gentle feedback.

### Service tests (`tests/test_recording_service.py`)

- Successful analysis with fake Gemini client returning `StructuredAudioAnalysis`.
- Missing API key raises mapped error.
- Empty recording still raises `EmptyRecordingError`.
- Structured response is normalized into `RecordingAnalysisResponse`.

### API tests (`tests/test_recording_api.py`)

- Successful multipart upload returns review payload.
- Missing `metadata` returns 400.
- Invalid `metadata` JSON returns 400.
- Empty audio returns 400.
- Storage error returns 500.
- Gemini failure returns 502.

### Gemini client tests (`tests/test_gemini_client.py`)

- `analyze_audio` constructs correct `types.Content` with text + inline audio parts.
- Structured JSON response is parsed and validated.
- Invalid credentials are classified correctly.
- Telemetry failures do not block successful analysis.

### Telemetry tests (`tests/test_gemini_telemetry.py`)

- `start_audio_analysis` creates an observation when Langfuse is configured.
- Returns a no-op trace when Langfuse is not configured.

### Integration / flow tests

- Update `tests/test_stage_4_flow_integration.py` to replace stub assertions with real-analysis expectations.

## Verification Criteria

Stage 6 is complete when:

- A recorded retelling can be sent from the UI and analyzed successfully.
- The review payload contains `summary`, `clarity`, `pace`, `hesitations`, and `recommendations` in the existing UI format.
- The backend respects the chosen `analysis_language` from config.
- Friendly error handling works for missing key, invalid key, empty recording, and Gemini-side failures.
- Audio-analysis calls are instrumented when Langfuse environment variables are present.
- All existing tests pass; new tests cover prompt building, service orchestration, API contract, and Gemini client behavior.
- The frontend review panel requires no structural changes.

## Self-Review Notes

- **Placeholder scan**: no TODO or TBD items remain.
- **Internal consistency**: the multipart contract carries metadata as a single JSON string field, which is simpler than multiple form fields and keeps validation centralized in Pydantic.
- **Scope check**: this design is focused on a single stage. History persistence is intentionally deferred to Stage 7.
- **Ambiguity check**: the mapping from structured scores to gentle text is intentionally soft; the exact wording is a product detail that can be refined during implementation and testing.
