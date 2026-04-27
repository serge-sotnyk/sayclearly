## SayClearly

Local-only diction training tool with a web UI and Gemini-based feedback.

The MVP specification lives in `docs/sayclearly_mvp_spec_en.md`.

### How a session works

SayClearly is built around a short pre-meeting diction warm-up — three quick
passes over a freshly generated text, each one roughly up to a minute long.

**1. Slow, exaggerated reading.** Read the text out loud very slowly and as
crisply as you can — over-articulate consonants and word endings. This wakes
up your articulators and lets your eyes scan the words ahead of your mouth.

**2. Closer to natural pace.** Read the same text again, this time closer to
normal speech — but still a bit slower and clearer than you'd usually speak.
The point is to check whether the clarity from step 1 holds once the tempo
picks up.

**3. Retell and record.** Look away from the text and retell it in your own
words, keeping the calm-and-clear style of step 2. The browser records this
pass. Listen back, send it to Gemini for analysis, and repeat the cycle if
you want.

There is no enforced timer — the steps are a structure, not a stopwatch. The
whole thing is meant to run through right before a meeting, interview, or
call, so your articulation is already warmed up by the time you start
talking to people.

#### What the analysis covers

Gemini acts as a diction coach over the final recording and returns:

- a clarity score and a pace score (0–100 each);
- hesitations with timestamps (`note` plus start/end seconds);
- a short summary and 2–4 gentle, practical recommendations.

The tone is intentionally non-judgmental — no harsh wording, no "X out of 10".

#### Languages

Any language Gemini supports works. The text language and the analysis
(feedback) language are configured separately, so you can practice in a
non-native language and read the feedback in one you're more comfortable
with.

#### Local storage

Session history (generated text and analysis output) lives in
`~/.sayclearly/history.json`, capped at the last 300 sessions. Recordings
are temporary by default and removed after analysis.

### MVP launch

```bash
uvx --from git+https://github.com/serge-sotnyk/sayclearly sayclearly
```

This is the intended MVP launch path. It starts the local FastAPI server and opens the browser. Runs fully locally on your machine.

### Local development setup

```bash
npm install
uv sync
uv run pre-commit install
```

`pre-commit install` wires up a hook that rebuilds the frontend bundle and refuses commits where the bundle would not match the staged TypeScript sources. Run it once after every fresh clone.

### Local development run

```bash
npm run build:frontend
uv run sayclearly
```

`uv run sayclearly` uses the same local app entry point for development. The frontend bundle under `src/sayclearly/static/dist/` is committed so the packaged repository snapshot still has the browser assets needed by the MVP launch path.

### Local `.env` Overrides

Copy `.env.example` to `.env` when you want local development-only overrides.

`uv run sayclearly` loads `.env` only from the current working directory. It does not search parent directories.

`.env.example` includes two optional Gemini model override variables:

- `SAYCLEARLY_DEFAULT_TEXT_MODEL`
- `SAYCLEARLY_DEFAULT_ANALYSIS_MODEL`

### Development

```bash
npm run test:frontend
uv run pytest
uv run ruff check .
uv run ruff format --check .
```
