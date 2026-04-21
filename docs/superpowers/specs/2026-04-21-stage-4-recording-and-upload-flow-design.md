# Stage 4 Recording and Upload Flow Design

## Summary

Stage 4 extends the existing Stage 3 guided exercise shell with the final retelling loop: browser recording, playback, re-recording, upload to the backend, temporary audio storage, and a stub review response.
The goal is to let a user complete a real recorded session end to end without adding Gemini analysis or history persistence yet.

This stage keeps the single-page FastAPI and plain TypeScript architecture from Stage 3. The browser owns microphone access and recording controls, while the backend accepts one uploaded audio file, stores it as temporary local data, cleans up older temporary files, and returns a deterministic stub analysis payload.

## Goals

- extend the Stage 3 flow beyond `step_3_retell_ready` without reworking the earlier reading steps;
- let the user explicitly start recording from the retelling step;
- support stop, playback, analyze, and re-record actions in the same exercise screen;
- upload the recorded audio to the backend through one simple API;
- store audio only as temporary local data and clean it up with a bounded rule;
- show a compact stub review payload in the UI so the full loop works before Gemini analysis arrives in Stage 6;
- handle microphone denial, unsupported browser APIs, empty recording, and failed upload with calm inline errors.

## Out Of Scope

Stage 4 does not include:

- Gemini-backed analysis;
- persistence of completed review results into history;
- a separate review page or frontend router;
- a server-managed temporary session resource or multiple upload endpoints;
- browser automation for real microphone behavior;
- strict audio format normalization beyond what the browser upload already provides.

## Design Principles

- Preserve the existing Stage 3 single-page shell and state-machine approach.
- Add the smallest recording loop that can reach a real end-to-end recorded session.
- Keep browser recording concerns in the frontend and keep backend routes thin.
- Introduce a dedicated recording or analysis backend boundary instead of extending `exercise/` beyond its purpose.
- Treat temporary audio as disposable runtime data, not as session history.
- Prefer inline recording errors over global app-wide failure states when the rest of the screen can keep working.
- Keep the API contract close to the later real analysis flow so Stage 6 can replace internals rather than UI structure.

## User Flow Boundary

Stage 4 should cover this end-to-end path:

1. Load the Stage 3 setup and guided reading flow.
2. Generate a placeholder exercise and advance through:
   - `step_1_slow`
   - `step_2_natural`
   - `step_3_retell_ready`
3. Click `Start recording` on the retelling step.
4. Let the browser request microphone permission.
5. Record the retelling and stop it explicitly.
6. Play back the recorded audio locally.
7. Either re-record or upload it for analysis.
8. Receive a stub review payload from the backend.
9. Show the review in the same exercise screen.

This stage intentionally stops before real Gemini analysis and before writing completed sessions into local history.

## State Model

The frontend should extend the current typed state machine instead of creating a second independent recording state store.

Existing states kept from Stage 3:

- `home`
- `generating_text`
- `step_1_slow`
- `step_2_natural`
- `step_3_retell_ready`
- `error`

New Stage 4 states:

- `requesting_microphone`
- `recording`
- `recorded`
- `analyzing`
- `review`

Required transitions:

- `step_3_retell_ready -> requesting_microphone` when the user clicks `Start recording`
- `requesting_microphone -> recording` when microphone access succeeds and `MediaRecorder` starts
- `requesting_microphone -> step_3_retell_ready` when microphone access is denied or unsupported, with an inline recording error
- `recording -> recorded` when the user stops recording and a non-empty blob is available
- `recording -> step_3_retell_ready` when recording ends without usable audio, with an inline recording error
- `recorded -> analyzing` when the user clicks `Analyze recording`
- `recorded -> step_3_retell_ready` when the user clicks `Record again`
- `analyzing -> review` when upload succeeds and a stub analysis payload returns
- `analyzing -> recorded` when upload fails, preserving playback and retry capability
- `review -> step_3_retell_ready` when the user clicks `Record again`
- `review -> home` when the user performs a full `Reset`

Rules:

- Stage 4 should not auto-start recording when the retelling step appears.
- The user must explicitly trigger recording with `Start recording`.
- The frontend must not allow `Analyze recording` before a non-empty recording exists.
- Starting a new recording must clear any previous stub review payload from the in-memory state.

## UI Structure

The page remains a single HTML document returned by `GET /`, but the exercise section grows a dedicated recording and review area.

### Exercise section additions

Responsibility: hold the retelling recording loop and the compact review payload without leaving the existing screen.

The exercise UI should add stable containers for:

- recording status and inline errors;
- `Start recording`;
- `Stop recording`;
- local playback via an `audio` element;
- `Analyze recording`;
- `Record again`;
- a compact review panel rendered after the stub response returns.

Behavior by state:

- `step_1_slow` and `step_2_natural`: unchanged from Stage 3.
- `step_3_retell_ready`: show retelling guidance plus `Start recording`.
- `requesting_microphone`: disable recording controls and show a waiting status.
- `recording`: show `Recording in progress` plus `Stop recording`.
- `recorded`: show playback, `Analyze recording`, and `Record again`.
- `analyzing`: keep playback visible, disable action buttons, and show an analysis-in-progress message.
- `review`: keep playback and review visible together, plus `Record again` and existing `Reset`.

### Review panel

Responsibility: show the first post-recording feedback loop without introducing a second page.

The review panel should render a response shaped like the later real analysis contract:

- `summary`
- `clarity`
- `pace`
- `hesitations`
- `recommendations`

The values are stubbed in Stage 4, but the UI should treat them as real response data instead of hardcoded copy.

## Frontend Composition

### HTML shell

`src/sayclearly/templates/index.html` should keep the current setup and exercise structure while adding data anchors for:

- a recording controls container;
- a recording status or error element;
- an `audio` preview element;
- analyze and re-record buttons;
- a review panel and its fields.

The recording area should stay inside the existing exercise panel so the flow still feels like one guided session.

### TypeScript state and rendering

`src/sayclearly/static/app_state.ts` should extend the app model with only the state required for the recording loop. In addition to new flow states, the model should track:

- whether a recording blob is currently available for upload;
- the current inline recording or upload error message, if any;
- the stub review payload, if one has been returned.

The frontend should avoid storing browser objects such as `MediaRecorder` or `MediaStream` inside the serializable app model. Those runtime handles should stay in local variables or a small helper owned by `app.ts`.

### TypeScript runtime behavior

`src/sayclearly/static/app.ts` should continue as the screen orchestrator. It should:

- request microphone access through `navigator.mediaDevices.getUserMedia` only when the user clicks `Start recording`;
- create and control a `MediaRecorder` instance;
- collect audio chunks and build one blob when recording stops;
- create a local object URL for playback;
- upload the blob through `fetch` using `FormData` to the new recording endpoint;
- render recording and review states without leaving the current page.

If the recording-specific code makes `app.ts` meaningfully harder to follow, a small helper module under `src/sayclearly/static/` is acceptable. The helper should stay narrow and focus on browser recording mechanics rather than duplicating app state management.

## Backend Module Boundaries

Stage 4 should add a small domain package for recording and temporary analysis transport instead of extending `exercise/`.

### `src/sayclearly/recording/models.py`

Responsibility: response models for stub analysis and any small internal metadata objects needed by the service.

The review response should include:

- `summary`
- `clarity`
- `pace`
- `hesitations`
- `recommendations`

The model names should be general enough that Stage 6 can reuse them when Gemini is added.

### `src/sayclearly/recording/service.py`

Responsibility: temporary audio persistence, bounded cleanup, and stub analysis generation.

This service should:

- accept an uploaded audio file from the API layer;
- reject empty uploads;
- write the file to a temporary local directory under the app data root;
- remove older temporary recording files during each successful analysis call, leaving only the newest file;
- return a deterministic stub analysis payload.

The stub payload can be stable and local-only. It does not need to infer real speech quality from the audio content.

### `src/sayclearly/recording/api.py`

Responsibility: HTTP transport for upload plus stub analysis.

The route should expose:

- `POST /api/analyze-recording`

The endpoint should accept `multipart/form-data` with one audio file field, call the recording service, map predictable client errors to `400`, and return the typed stub analysis response.

### `src/sayclearly/app.py`

Responsibility: include the recording router and keep composition root logic centralized.

## Temporary Audio Lifecycle

Temporary audio should stay outside persisted history data and should be treated as disposable runtime state.

Storage behavior:

- store temporary audio under the local app data root in a dedicated temporary recordings directory;
- on each successful analyze request, save the newly uploaded file first;
- after saving it, delete older temporary recording files so only the newest file remains.

This cleanup rule is intentionally simple. It satisfies the requirement that temporary audio does not grow without bound, while avoiding a more complex temporary-session lifecycle before the product needs it.

`Reset` does not need a dedicated backend cleanup endpoint in Stage 4. The bounded cleanup rule on analyze is enough for this phase, and later stages can tighten cleanup behavior if product needs become more specific.

## Error Handling

### Frontend handling

Recording and upload errors should be rendered inline in the recording area rather than routed through the global app banner whenever possible.

Required frontend cases:

- unsupported browser APIs: show a friendly message and keep the rest of the exercise screen usable;
- denied microphone permission: return to `step_3_retell_ready`, show an inline retryable message, and keep `Start recording` available;
- empty recording blob: return to `step_3_retell_ready` with an inline message and no review payload;
- failed upload: return from `analyzing` to `recorded`, preserve playback, and allow retrying `Analyze recording` without re-recording.

### Backend handling

Required backend cases:

- missing audio file field: `400`;
- empty uploaded file: `400`;
- storage write failure: `500`;
- unexpected service failure during stub analysis: `500`.

Stage 4 does not need heavy audio sniffing or strict content-type validation. If a browser-provided audio upload arrives with a plausible file object, the service can accept it.

Cleanup failures for older temporary files should not turn a successful fresh analyze call into an API failure. The main success path is more important than perfect eager cleanup in this stage.

## Testing Strategy

Stage 4 should follow the existing repository pattern of focused backend tests plus shell assertions, without introducing browser end-to-end automation.

### Backend tests

Add `tests/test_recording_service.py` to cover:

- saving uploaded audio into the temporary directory;
- deleting older temporary files on later successful analyzes;
- returning the stub analysis payload in the expected structure;
- rejecting empty uploads.

Add `tests/test_recording_api.py` to cover:

- `POST /api/analyze-recording` happy path with multipart upload;
- `400` when the file part is missing;
- `400` when the uploaded file is empty;
- `500` when the storage layer fails.

### Integration coverage

Extend the existing flow-oriented integration coverage so the app can:

- save config;
- generate placeholder exercise text;
- accept an uploaded recording;
- return a stub review payload.

### App shell coverage

Update `tests/test_app_shell.py` so the home page asserts the presence of the new recording and review data anchors.

### Frontend logic coverage

If the current toolchain can support small TypeScript state tests cheaply, add pure state tests around the new recording-related transitions. If not, Stage 4 can stop at backend and shell coverage, as long as the TypeScript state logic stays small and explicit.

## Stage Boundary To Stage 6

This design keeps Stage 4 intentionally narrow while setting up the later real analysis stage.

What Stage 6 should be able to replace without reworking the UI:

- the internals of `POST /api/analyze-recording`;
- the stub analysis generator inside `recording/service.py`;
- any temporary response shaping needed to call Gemini.

What should remain stable after Stage 4:

- the retelling recording loop in the browser;
- the one-screen exercise and review experience;
- the upload contract from frontend to backend;
- the review payload shape shown in the UI.
