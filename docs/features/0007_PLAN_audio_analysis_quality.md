# Audio analysis quality — diagnosis & fix plan

## Context

The user reports three problems with audio feedback in SayClearly:

1. The analysis almost always comes back in **English**, even when `analysis_language` is set to Ukrainian.
2. The content is **generic boilerplate** ("articulation generally clear, pace decent, here are some hesitations, try to slow down") and barely depends on what was actually said.
3. It is unclear from Langfuse traces whether the **audio is being sent at all**.

Goal: improve quality and localization of feedback without breaking the current MVP. The plan is phased: after P1+P2 there is a **stop for manual verification**, then we proceed point by point.

---

## Findings (diagnosis)

### 1. Audio is sent correctly

[src/sayclearly/gemini/client.py:139-155](src/sayclearly/gemini/client.py:139) builds a multimodal request:

```python
contents=[
    types.Part.from_bytes(data=audio_bytes, mime_type=content_type),
    prompt,
]
```

The frontend ([recording.ts:208-217](src/sayclearly/static/features/recording.ts:208)) sends `multipart/form-data` with the blob under the `audio` field and JSON metadata. The backend ([recording/api.py:22-39](src/sayclearly/recording/api.py:22)) reads the bytes and forwards them to `RecordingService.analyze_recording`.

**Why audio is not visible in Langfuse:** telemetry (`start_audio_analysis`) only logs the textual `prompt`, `model`, `thinking_level`. Bytes are not added to `trace.input` — hence the impression that "audio is not being sent."

### 2. Analysis in English — root causes

The prompt ([recording/prompts.py:14-32](src/sayclearly/recording/prompts.py:14)) injects the language as **metadata**, but **does not instruct** the model to answer in that language:

```
Language spoken: Ukrainian
Feedback language: Ukrainian
...
- summary: array of short, gentle observations
- recommendations: array of 2-4 practical, encouraging suggestions
```

The system instruction ([prompts.py:1-11](src/sayclearly/recording/prompts.py:1)) is fully in English with no directive about the output language. The model sees an entirely English instruction context and defaults to English output.

In addition, **the backend itself injects English** into the result:

- [recording/service.py:168-175](src/sayclearly/recording/service.py:168) `_score_to_text` hardcodes phrases like `"The clarity is very good."` regardless of language.
- [recording/service.py:161](src/sayclearly/recording/service.py:161) builds the hesitation string as `f"{note} (at {start:.1f}s-{end:.1f}s)"` — an English template wrapping `note`.

### 3. Generic analysis — why

- **No grounding in content.** The prompt includes `exercise_text` but does not instruct the model to "compare the retelling against this text, note which ideas were lost or distorted, point out specific words where articulation slipped."
- **No scale calibration** for 0–100 → the model gravitates toward 75–85.
- **No definition of "hesitation".** The history shows initial silence 0.0–2.0 being classified as a hesitation ("Initial silence before the speaker started speaking") — that is noise, not a hesitation.
- **Weak `hesitations` schema.** [models.py:19](src/sayclearly/recording/models.py:19) declares `hesitations: list[dict[str, object]]` — Gemini receives a free-form shape instead of a typed `Hesitation` object.
- **`temperature=1`** ([client.py:147](src/sayclearly/gemini/client.py:147)) is too high for an analytical task.
- **System instruction over-softens without demanding specifics:** "Avoid harsh evaluative wording" + no requirement to quote concrete words → safe, generic statements.
- **Model `gemini-3.1-flash-lite-preview`** is the lite variant. We will check this separately as an experiment, not in code.

### 4. `recommendations` are dropped from history

Gemini returns `recommendations` and they are shown on the Review screen. But `SessionAnalysis` ([storage/models.py:79-85](src/sayclearly/storage/models.py:79)) **has no `recommendations` field** — `history.json` only stores `clarity_score`, `pace_score`, `hesitations`, `summary`. This is visible in every session in the user's history.

---

## Phase A — P1 + P2 (language and grounding) → STOP, manual check

After this phase the user manually runs several sessions in Ukrainian and English, evaluates quality and localization. Only after the user's OK do we proceed to Phase B.

### P1. Localizing feedback

**[src/sayclearly/recording/prompts.py](src/sayclearly/recording/prompts.py)**

In `build_audio_analysis_prompt` and `build_audio_analysis_system_instruction` add an explicit requirement:

> **All natural-language values** in the JSON output (`summary` items, `recommendations` items, each hesitation `note`, `clarity_comment`, `pace_comment`) **MUST be written in {analysis_language}**. JSON keys remain in English; only string values are localized. Do not mix languages within one value.

Also parameterize the system instruction with `analysis_language` (currently it is built without arguments).

**[src/sayclearly/recording/models.py](src/sayclearly/recording/models.py)** — extend `StructuredAudioAnalysis`:

- `clarity_comment: str` — short phrase in `analysis_language` explaining `clarity_score`.
- `pace_comment: str` — same for `pace_score`.

**[src/sayclearly/recording/service.py](src/sayclearly/recording/service.py)**

- **Remove** `_score_to_text` (English hardcode).
- In `_normalize_analysis` source `RecordingReview.clarity` and `.pace` directly from `structured.clarity_comment` / `structured.pace_comment`.
- Stop formatting hesitations as strings. Pass a structured `{note, start, end}` object to the frontend. The English template `"(at Xs-Ys)"` goes away.

**[src/sayclearly/recording/models.py](src/sayclearly/recording/models.py)** — `RecordingReview.hesitations: list[Hesitation]` instead of `list[str]`.

**Frontend ([src/sayclearly/static/features/](src/sayclearly/static/features/)):** wherever the Review screen renders hesitations, switch from a string list to a structured object; localize the time format by `ui_language` (a small helper, no i18n framework — just seconds + separator).

### P2. Grounding and concreteness

**[src/sayclearly/recording/prompts.py](src/sayclearly/recording/prompts.py)** — rewrite the prompt so it:

1. **Defines hesitation precisely:**
   > A hesitation is one of: a pause ≥ 400 ms **inside a sentence**, a filler sound (uh, um, э-э, ну), a restart, a mid-word stall. **Do NOT count silence before the first word or after the last word** — those are not hesitations.

2. **Quotes from the audio.** Each `note` (in `analysis_language`) should reference 1–3 surrounding words from the actual speech (in `language`). Example: `note = "пауза перед словом «термоядерні»"`.

3. **Compares to exercise_text.** Add an explicit instruction (and an optional schema field — **final decision in Phase B**, see below): "Compare what was said to the exercise text. Note which key ideas were preserved, simplified, omitted, or distorted. In `summary`, include at least one observation about content fidelity."

4. **Calibrates the scales** — provide anchors:
   - 90+ : near-native, no fillers, clear endings
   - 70–89 : clearly understandable, occasional fillers/blur
   - 50–69 : comprehensible with effort, frequent issues
   - <50 : restarts/blurring dominate

5. **Demands specifics.** "Mention 1–2 specific words where articulation was unclear. Mention which sentences were delivered fastest/slowest. Avoid generic phrases like 'articulation is generally clear' without concrete examples."

6. **Constrains length.** `summary`: 2–4 items, each ≤ 25 words. `recommendations`: 2–4, each practical (what to do specifically), not "try to slow down" in the abstract.

### Phase A — verification (manual checks)

1. Run `uv run sayclearly`, do 2 sessions in Ukrainian.
2. Verify that `summary`, `recommendations`, `clarity_comment`, `pace_comment`, and every hesitation `note` are in Ukrainian on the Review screen.
3. Verify that there is **no** "Initial silence before the speaker started" hesitation.
4. Verify that there is at least one quoted concrete word and at least one observation about how the retelling matches `exercise_text`.
5. Repeat for English.
6. **STOP. Wait for user OK or feedback.**

### Phase A — files to modify

- [src/sayclearly/recording/prompts.py](src/sayclearly/recording/prompts.py)
- [src/sayclearly/recording/models.py](src/sayclearly/recording/models.py) (add `clarity_comment`, `pace_comment`; `RecordingReview.hesitations` → `list[Hesitation]`)
- [src/sayclearly/recording/service.py](src/sayclearly/recording/service.py) (remove `_score_to_text`, stop stringifying hesitations)
- [src/sayclearly/static/features/](src/sayclearly/static/features/) — Review hesitations rendering
- `tests/test_recording_*.py` — update coverage for the new fields and format

---

## Phase B — after user OK

### P3. Strict schema for hesitations

**[src/sayclearly/recording/models.py:14-21](src/sayclearly/recording/models.py:14)** — replace `hesitations: list[dict[str, object]]` with `hesitations: list[Hesitation]` (reuse the existing model from [storage/models.py:65](src/sayclearly/storage/models.py:65)). This gives Gemini a strict per-item schema and removes the free-form shape.

After this, `_normalize_analysis` ([service.py:144-149](src/sayclearly/recording/service.py:144)) simplifies — the `try/except` around `Hesitation.model_validate(dict)` goes away because the schema is already typed.

### P4. Lower temperature for analysis

**[src/sayclearly/gemini/client.py:147](src/sayclearly/gemini/client.py:147)** — `temperature=0.3` for `analyze_audio` (text generation stays at 1.0). The constant lives in `client.py`.

### P5. Persist `recommendations` and comments in history

**[src/sayclearly/storage/models.py:79-85](src/sayclearly/storage/models.py:79)** — extend `SessionAnalysis`:

```python
recommendations: list[str] = Field(default_factory=list)
clarity_comment: str = ""
pace_comment: str = ""
```

`default_factory` / default values cover old records — no migration needed (the loader tolerates missing fields).

**[src/sayclearly/recording/service.py](src/sayclearly/recording/service.py)** — `_normalize_analysis` propagates all three fields into `SessionAnalysis`.

**Frontend:** when rendering the session detail in the History screen, show recommendations (when non-empty). The new field appears without API-schema changes (FastAPI serializes it automatically).

### P6. Audio visibility in Langfuse

**`src/sayclearly/gemini/telemetry.py`** (`start_audio_analysis`) — extend `trace.input` with:

```python
{
    "prompt": prompt,
    "audio_size_bytes": len(audio_bytes),
    "content_type": content_type,
    "language": language,
    "analysis_language": analysis_language,
}
```

`analyze_audio` in `client.py` must pass these fields into the telemetry start. Plumb them through the `start_audio_analysis` signature. We do not write the blob to Langfuse itself (Langfuse media is a separate topic, out of scope here).

### Phase B — verification

1. **P3:** run a session, in `~/.sayclearly/history.json` `hesitations` is an array of `{start, end, note}` objects with no extra fields.
2. **P4:** run 3 sessions on the same audio — `clarity_score` / `pace_score` are noticeably more stable than before.
3. **P5:** `history.json` now contains `recommendations`, `clarity_comment`, `pace_comment`. Old sessions still load (they get empty defaults).
4. **P6:** the Langfuse trace for `gemini.analyze_audio` shows `audio_size_bytes`, `content_type`, `language`, `analysis_language` in input.

### Phase B — files to modify

- [src/sayclearly/recording/models.py](src/sayclearly/recording/models.py)
- [src/sayclearly/gemini/client.py](src/sayclearly/gemini/client.py)
- [src/sayclearly/storage/models.py](src/sayclearly/storage/models.py)
- [src/sayclearly/recording/service.py](src/sayclearly/recording/service.py)
- `src/sayclearly/gemini/telemetry.py` (verify exact location)
- Frontend History screen (recommendations rendering)
- Persistence + telemetry tests

---

## Out of scope (separate, no code)

- **Model experiment.** Compare `gemini-3-flash-preview` vs `gemini-2.5-flash` vs `gemini-3.1-flash-lite-preview` on the same audio after P1+P2. Decision about the default in [gemini/catalog.py:9](src/sayclearly/gemini/catalog.py:9) is taken from the results, as a separate task.

---

## General verification (after each phase)

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
npm run test:frontend
```

Plus a manual `uv run sayclearly` run with a real recording.
