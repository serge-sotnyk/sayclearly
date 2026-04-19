# SayClearly - MVP Specification

## 1. Summary

**SayClearly** is a local diction training tool with a web UI that runs with a single command via `uvx`.

The application:

- generates a short exercise text in the target language;
- guides the user through 3 exercise steps;
- records the final run;
- sends the recording to Gemini for analysis;
- shows gentle, practical feedback;
- stores a local history of recent sessions.

The MVP is aimed primarily at **a single user** who runs the app locally and uses **their own Gemini API key**.

---

## 2. Product goals

### Main goal

Create a very simple personal tool that reduces friction before speaking practice:

- a meeting;
- an interview;
- a call;
- any short conversation in Ukrainian / English / another language.

### Product value

The user does not have to search for texts manually or invent an exercise on their own. They open the local app, get a new text, go through a short session, and receive clear feedback.

### What MVP should validate

1. It is genuinely convenient for the user to do 1-3 short sessions per day.
2. Generating new texts increases engagement and reduces routine.
3. Analysis of the final run helps the user notice real patterns:
   - overly fast pace;
   - hesitations;
   - blurred endings;
   - reduced clarity near the end.
4. A local BYOK model is convenient enough and does not get in the way.

---

## 3. Non-goals for MVP

In the MVP, we **do not build**:

- accounts;
- cloud sync;
- a shared server;
- storage of other users' keys;
- real-time analysis during reading;
- comparison with a reference recording;
- multiple user roles;
- social features;
- gamification;
- long-term audio archive storage;
- complex progress analytics.

---

## 4. Distribution model

## Launch format

At the MVP stage, the application can be launched **directly from the GitHub repository**.

Main launch option:

```bash
uvx --from git+https://github.com/serge-sotnyk/sayclearly sayclearly
```

Later, if useful, the application can also be published to a package index, but this is not required for the first version.

The command:

- starts a local FastAPI server;
- opens the browser;
- shows the web UI;
- runs fully locally on the user's machine.

## Why this format

Local launch via `uvx` was chosen because it:

- does not require a domain;
- does not require a separate deployment;
- does not require responsibility for other users' keys;
- provides a good UX through a browser interface;
- fits the MVP better than a public website or desktop packaging.

---

## 5. High-level architecture

## Stack

### Backend

- Python 3.13+
- FastAPI
- Uvicorn
- Jinja2 templates

### Frontend

- Server-rendered HTML
- CSS
- plain TypeScript without React
- browser APIs:
  - `MediaRecorder`
  - `getUserMedia`
  - `fetch`

### AI provider

- Gemini API

### Optional observability

- Langfuse, if enabled via environment variables

### Storage

- local folder `~/.sayclearly/`
- `config.json`
- `history.json`
- `cache/`

---

## 6. Core user flow

## First launch

1. The user runs `uvx sayclearly`
2. The browser opens with the local application
3. The application prompts for a Gemini API key
4. The key is stored locally on this computer for future launches
5. The user sets:
   - text language;
   - optionally a topic
6. Clicks **Generate exercise**

## Exercise flow

After generating the text, the user goes through 3 steps:

### Step 1 - Slow clear reading

Instruction:

- read the text very slowly and clearly;
- with stronger articulation;
- without rushing.

### Step 2 - Natural clear reading

Instruction:

- read the same text a bit more naturally;
- keep clarity and control.

### Step 3 - Free retelling + recording

Instruction:

- briefly retell the meaning freely;
- recording starts;
- the user speaks the retelling.

After stopping the recording:

- the user can listen to the recording;
- send it for analysis;
- re-record it.

## Review flow

After the analysis, the user sees:

- a short summary;
- clarity;
- pace;
- possible hesitation points;
- short recommendations.

The session is saved to the local history.

---

## 7. Functional requirements

## 7.1 Exercise text generation

The application must be able to:

- generate a new short exercise text;
- account for the language;
- account for the topic if provided;
- make the text interesting, preferably with new facts;
- avoid repeating recent texts;
- allow reusing a previous topic.

### Target text shape

The text should be:

- about 5-8 sentences long;
- suitable for reading aloud;
- not too syntactically complex;
- substantive enough to allow a short retelling.

## 7.2 Supported languages

The MVP should support two independent language parameters:

- **exercise text language**;
- **analysis / feedback language**.

By default, the analysis language should match the text language.

In practice, the UI should provide:

- a field or selector for the text language;
- a field or selector for the analysis language;
- quick buttons for popular languages, for example:
  - English
  - Ukrainian
- a button or flag such as **Use same language for analysis**.

There is no need to strictly limit the list of languages.

## 7.3 Topic handling

The user can:

- provide a new topic;
- leave the topic empty;
- reuse a topic from a previous session.

## 7.4 Recording

The application must:

- request microphone access;
- record the final retelling in the browser;
- allow playback before analysis;
- allow re-recording of the final run.

## 7.5 Audio analysis

After recording, the application must send the audio to the backend, and the backend must send it to Gemini.

The analysis must return compact, practical feedback:

- clarity;
- pace;
- where hesitations started;
- noticeable problems with endings / blurring / speeding up;
- 2-4 short recommendations.

## 7.6 History

The application must store a local history of recent sessions.

History is needed so the user can:

- quickly open previous texts;
- see which topics have already been used;
- review past analysis results.

---

## 8. UX requirements

## UX principles

The interface should be:

- very simple;
- calm;
- not overloaded;
- free from an "exam" feeling;
- free from harsh evaluative wording.

## Tone of feedback

Feedback should be gentle and practical.

Example of a suitable style:

- "The pace noticeably increased near the end."
- "There were a few short phrase restarts in several places."
- "If you slow down a little, the speech will become clearer."

Example of an unsuitable style:

- "The speech is bad."
- "You speak unclearly."
- "Score: 4/10."

## Main screens

### 1. Home / setup screen

Contains:

- API key input;
- settings button;
- text language;
- analysis language;
- flag: use the same language for analysis;
- topic;
- reuse last topic;
- generate button.

### 2. Exercise screen

Contains:

- generated text;
- current step;
- short instruction;
- timer / step indicator;
- next-step buttons.

### 3. Recording screen

Contains:

- instruction for the retelling step;
- start/stop recording button;
- playback;
- re-record;
- analyze.

### 4. Review screen

Contains:

- short summary;
- clarity;
- pace;
- hesitations;
- short advice;
- buttons: new session / reuse topic / open history.

### 5. History screen

Contains a list of recent sessions:

- date;
- language;
- topic;
- short analysis summary.

The user can open details of a past session.

### 6. Settings screen

Contains:

- saved API key status;
- clear saved API key button.

---

## 9. State model

The main UI logic is implemented as a simple state machine.

### States

- `home`
- `generating_text`
- `step_1_slow`
- `step_2_natural`
- `step_3_retell_ready`
- `recording`
- `recorded`
- `analyzing`
- `review`
- `history`
- `error`

### Key transitions

- `home -> generating_text`
- `generating_text -> step_1_slow`
- `step_1_slow -> step_2_natural`
- `step_2_natural -> step_3_retell_ready`
- `step_3_retell_ready -> recording`
- `recording -> recorded`
- `recorded -> analyzing`
- `analyzing -> review`
- `review -> home`
- `review -> history`

---

## 10. Storage design

## Root folder

```text
~/.sayclearly/
```

## Files

### `config.json`

Stores application settings.

### `history.json`

Stores recent sessions.

### `cache/`

Temporary files, including the current recording before analysis.

---

## 11. Data formats

## 11.1 config.json

Example:

```json
{
  "version": 1,
  "language": "uk",
  "analysis_language": "uk",
  "ui_language": "ru",
  "same_language_for_analysis": true,
  "last_topic_prompt": "interesting facts about science",
  "session_limit": 300,
  "keep_last_audio": false
}
```

### Notes

- `same_language_for_analysis = true` by default
- if a local API key is present, it may be stored in a separate field or separate file
- the settings screen must allow clearing the stored key
- this is a local application for one user, so complex storage is not required

## 11.2 history.json

Example:

```json
{
  "version": 1,
  "sessions": [
    {
      "id": "2026-04-18T18:42:11",
      "created_at": "2026-04-18T18:42:11",
      "language": "uk",
      "topic_prompt": "interesting facts about astronomy",
      "text": "Generated exercise text...",
      "analysis": {
        "clarity_score": 7,
        "pace_score": 6,
        "hesitations": [
          {
            "start": 12.4,
            "end": 13.1,
            "note": "short restart"
          }
        ],
        "summary": [
          "Tempo increased near the end",
          "Some phrase endings became less clear"
        ]
      }
    }
  ]
}
```

### History rules

- store only the latest **300** sessions;
- old entries are removed automatically;
- file writes must be atomic.

---

## 12. Audio storage policy

For the MVP, long-term audio storage is **not required**.

### MVP behavior

- audio is written to a temporary file;
- the user can listen to it immediately after recording;
- after analysis, the audio can be deleted;
- at most, an option `keep_last_audio` may be kept, but it is off by default.

### Why

This simplifies:

- privacy;
- disk management;
- file structure;
- cleanup of old data.

---

## 13. API design

## Backend endpoints

### `GET /`

Returns the main HTML page.

### `GET /api/config`

Returns the current configuration.

### `POST /api/config`

Saves the updated configuration.

### `DELETE /api/config/api-key`

Deletes the locally stored Gemini API key.

### `POST /api/generate-text`

Input:

```json
{
  "language": "uk",
  "analysis_language": "ru",
  "topic_prompt": "interesting facts about astronomy",
  "reuse_last_topic": true
}
```

Output:

```json
{
  "text": "...",
  "language": "uk",
  "analysis_language": "ru",
  "topic_prompt": "interesting facts about astronomy"
}
```

### `POST /api/analyze-audio`

Multipart request:

- audio file
- metadata about current session

Output:

```json
{
  "analysis": {
    "clarity_score": 7,
    "pace_score": 6,
    "hesitations": [
      {
        "start": 12.4,
        "end": 13.1,
        "note": "short restart"
      }
    ],
    "summary": [
      "Tempo increased near the end",
      "Some phrase endings became less clear"
    ]
  }
}
```

### `GET /api/history`

Returns the history of recent sessions.

### `GET /api/history/{session_id}`

Returns one session.

### `POST /api/history`

Saves a new session.

### `GET /api/health`

Simple health check.

---

## 14. Gemini integration

## 14.1 Text generation prompt intent

The model should generate a text that:

- is interesting;
- is suitable for reading aloud;
- contains 5-8 sentences;
- allows for a short retelling;
- does not repeat recent texts too closely.

## 14.2 Audio analysis prompt intent

The model should analyze not only the content, but also the quality of pronunciation from audio.

The analysis language is set separately and by default matches the text language. This is especially useful when the user is speaking in a non-native language but wants to read the comments in a more comfortable language.

Expected focus of the analysis:

- speech clarity;
- pace;
- hesitations;
- blurred endings;
- speeding up or loss of control near the end;
- gentle recommendations.

## 14.3 Output format

Use **structured JSON** for both tasks.

The backend must normalize the model response into a compact format suitable for history.

## 14.4 Optional Langfuse instrumentation

`Langfuse` is an **optional integration** in the MVP for logging LLM calls.

### Trigger

Instrumentation is enabled automatically if the following are set in the backend process environment:

- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_HOST`

If these variables are absent, the application continues to work normally without logging to `Langfuse`.

### Scope

In the MVP, logging through `Langfuse` must cover all LLM calls:

- exercise text generation;
- audio analysis.

### Integration approach

For the MVP, use **instrumentation at the client library / SDK level** first, so calls are logged automatically where supported.

If automatic instrumentation turns out to be insufficient or unstable, manual span / trace wrappers around the main LLM operations may be added in later iterations, but this is not a required part of the current MVP.

---

## 15. Key handling

## Goals

- the key belongs to the user;
- the application does not send the key to the developer's server;
- the key is used only by the local backend.

## MVP behavior

- the key is stored locally on this machine for future launches;
- the settings screen must allow clearing the stored key at any time.

---

## 16. Error handling

The application must correctly handle:

- missing API key;
- invalid API key;
- no microphone access;
- an empty recording;
- a Gemini API error;
- network loss;
- inability to write the history file.

UI errors should be:

- short;
- human-friendly;
- free of technical panic.

Examples:

- "Could not get microphone access."
- "It looks like the API key did not work."
- "Analysis did not complete. Try again."

---

## 17. Security and privacy notes

Since this is a local application:

- the key is not sent to the developer's server;
- history is stored locally;
- audio is not stored long-term in the MVP by default.
- when `Langfuse` is enabled, metadata and results of LLM calls may be sent to the configured `LANGFUSE_HOST`.

It is important to clearly show the user:

- that the recording is sent to Gemini for analysis;
- that the key belongs to the user;
- that the data is stored locally.

If `Langfuse` is enabled, this should also be clearly treated as optional telemetry that depends on locally defined environment variables.

---

## 18. Packaging and project structure

Example project structure:

```text
sayclearly/
  pyproject.toml
  src/sayclearly/
    __init__.py
    main.py
    app.py
    config.py
    storage.py
    gemini.py
    models.py
    templates/
      index.html
    static/
      styles.css
      app.ts
      app.js
```

### Packaging requirements

- launch via `uvx sayclearly`
- entry point via `[project.scripts]`
- backend starts on a fixed localhost port
- browser opens automatically

---

## 19. MVP success criteria

The MVP can be considered successful if:

1. The user can start an exercise in under 1 minute.
2. One session takes about 3-5 minutes.
3. The user wants to repeat it at least several times a week.
4. The feedback after recording feels useful rather than formal.
5. The history provides a minimal sense of progress.

---

## 20. Future extensions after MVP

After the MVP, we can add:

- saving the last recording on request;
- storing several recent recordings;
- a screen for recurring speech issues;
- separate text difficulty modes;
- different exercise types;
- desktop packaging;
- a public web version;
- history export;
- comparison of several recent results;
- additional analysis modes for a specific language.

---

## 21. Final MVP decision summary

For the first version, we fix the following:

- **Product name:** SayClearly
- **Launch:** `uvx --from git+https://github.com/serge-sotnyk/sayclearly sayclearly`
- **Architecture:** local-only
- **Backend:** FastAPI
- **Templates:** Jinja2
- **Frontend:** plain TypeScript
- **AI:** Gemini
- **Optional observability:** Langfuse via env-based auto-instrumentation
- **Key model:** BYOK
- **Storage:** `~/.sayclearly/`
- **History:** one `history.json`, maximum 300 sessions
- **Audio:** temporary storage only by default
- **No DB in MVP**
- **No remote server in MVP**

---

## 22. Immediate next implementation step

The next step after this specification:

**create technical implementation plan v1** broken down into stages:

1. package skeleton;
2. local launcher;
3. config/history storage;
4. HTML screens;
5. TypeScript state machine;
6. recording flow;
7. Gemini text generation;
8. Gemini audio analysis;
9. save/review/history;
10. packaging and smoke test.
