import assert from 'node:assert/strict';
import test from 'node:test';

import { startApp } from '../src/sayclearly/static/dist/app.js';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...tokens) {
    for (const token of tokens) {
      this.values.add(token);
    }
  }

  remove(...tokens) {
    for (const token of tokens) {
      this.values.delete(token);
    }
  }

  toggle(token, force) {
    if (force === true) {
      this.values.add(token);
      return true;
    }

    if (force === false) {
      this.values.delete(token);
      return false;
    }

    if (this.values.has(token)) {
      this.values.delete(token);
      return false;
    }

    this.values.add(token);
    return true;
  }

  contains(token) {
    return this.values.has(token);
  }
}

class FakeElement {
  constructor(initial = {}) {
    this.value = initial.value ?? '';
    this.src = initial.src ?? '';
    this.checked = initial.checked ?? false;
    this.hidden = initial.hidden ?? false;
    this.textContent = initial.textContent ?? '';
    this.disabled = initial.disabled ?? false;
    this.children = initial.children ?? [];
    this.listeners = new Map();
    this.classList = new FakeClassList();
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type) {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      await listener({ currentTarget: this, target: this, preventDefault() {} });
    }
  }

  async click() {
    await this.dispatch('click');
  }

  async input() {
    await this.dispatch('input');
  }

  async change() {
    await this.dispatch('change');
  }
}

class FakeRoot extends FakeElement {
  constructor(elements) {
    super();
    this.elements = elements;
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }
}

class FakeRecorder {
  constructor(recordedBlob) {
    this.recordedBlob = recordedBlob;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, event = {}) {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener(event);
    }
  }

  start() {
    this.emit('dataavailable', { data: this.recordedBlob });
  }

  stop() {
    this.emit('stop');
  }
}

class FakeTrack {
  constructor() {
    this.stopCalls = 0;
  }

  stop() {
    this.stopCalls += 1;
  }
}

class FakeStream {
  constructor(tracks = [new FakeTrack()]) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }
}

function createConfig(overrides = {}) {
  return {
    version: 1,
    text_language: 'uk',
    analysis_language: 'uk',
    same_language_for_analysis: true,
    ui_language: 'uk',
    last_topic_prompt: 'Morning routines',
    session_limit: 10,
    keep_last_audio: false,
    gemini: {
      model: 'gemini-3-flash-preview',
      text_model: 'gemini-3-flash-preview',
      analysis_model: 'gemini-3.1-flash-lite-preview',
      same_model_for_analysis: false,
      text_thinking_level: 'medium',
      has_api_key: true,
      api_key_source: 'stored',
      available_models: [
        {
          id: 'gemini-3-flash-preview',
          label: 'Gemini 3 Flash',
          free_tier_requests_per_day_hint: null,
        },
        {
          id: 'gemini-2.5-flash',
          label: 'Gemini 2.5 Flash',
          free_tier_requests_per_day_hint: 250,
        },
      ],
    },
    langfuse: {
      host: null,
      enabled: false,
      has_public_key: false,
      has_secret_key: false,
      public_key_source: 'none',
      secret_key_source: 'none',
    },
    ...overrides,
  };
}

function createExercise(overrides = {}) {
  return {
    language: 'uk',
    analysis_language: 'uk',
    topic_prompt: 'Morning routines',
    text: 'Speak slowly first, then at a natural pace, then retell it from memory.',
    ...overrides,
  };
}

function createShell() {
  const elements = new Map([
    ['[data-open-settings-button]', new FakeElement()],
    ['[data-status-message]', new FakeElement({ textContent: 'Ready to generate a guided exercise.' })],
    ['[data-screen="setup"]', new FakeElement()],
    ['[data-screen="exercise"]', new FakeElement()],
    ['[data-settings-panel]', new FakeElement({ hidden: true })],
    ['[data-api-key-input]', new FakeElement()],
    ['[data-text-model-select]', new FakeElement()],
    ['[data-analysis-model-select]', new FakeElement()],
    ['[data-same-model-toggle]', new FakeElement()],
    ['[data-thinking-level-select]', new FakeElement()],
    ['[data-text-language-input]', new FakeElement()],
    ['[data-analysis-language-input]', new FakeElement()],
    ['[data-same-language-toggle]', new FakeElement({ checked: true })],
    ['[data-topic-input]', new FakeElement()],
    ['[data-reuse-topic-button]', new FakeElement()],
    ['[data-generate-button]', new FakeElement()],
    ['[data-step-label]', new FakeElement()],
    ['[data-step-title]', new FakeElement()],
    ['[data-step-instruction]', new FakeElement()],
    ['[data-exercise-text]', new FakeElement()],
    ['[data-reset-button]', new FakeElement()],
    ['[data-next-step-button]', new FakeElement()],
    ['[data-recording-controls]', new FakeElement({ hidden: true })],
    ['[data-recording-status]', new FakeElement()],
    ['[data-start-recording-button]', new FakeElement()],
    ['[data-stop-recording-button]', new FakeElement({ hidden: true })],
    ['[data-analyze-recording-button]', new FakeElement({ hidden: true })],
    ['[data-record-again-button]', new FakeElement({ hidden: true })],
    ['[data-recording-preview]', new FakeElement({ hidden: true })],
    ['[data-review-panel]', new FakeElement({ hidden: true })],
    ['[data-review-summary]', new FakeElement()],
    ['[data-review-clarity]', new FakeElement()],
    ['[data-review-pace]', new FakeElement()],
    ['[data-review-hesitations]', new FakeElement()],
    ['[data-review-recommendations]', new FakeElement()],
    ['[data-settings-status]', new FakeElement()],
    ['[data-clear-api-key-button]', new FakeElement()],
    ['[data-close-settings-button]', new FakeElement()],
  ]);

  const root = new FakeRoot(elements);
  const document = {
    createElement() {
      return new FakeElement();
    },
    querySelector(selector) {
      if (selector === '[data-app-root]') {
        return root;
      }

      return null;
    },
  };

  return { document, root, elements };
}

function createResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

function createFetchStub(...responses) {
  const calls = [];
  const queue = [...responses];
  const fetchStub = async (url, options = {}) => {
    calls.push({ url, options });
    const next = queue.shift();
    if (next instanceof Error) {
      throw next;
    }

    if (!next) {
      throw new Error(`No stubbed response left for ${url}`);
    }

    return next;
  };

  return { fetchStub, calls };
}

function createRecordingApi(recordedBlob = new Blob(['voice sample'], { type: 'audio/webm' })) {
  const stream = new FakeStream();
  let recorder = null;

  return {
    stream,
    get recorder() {
      return recorder;
    },
    isSupported() {
      return true;
    },
    async getUserMedia() {
      return stream;
    },
    createMediaRecorder() {
      recorder = new FakeRecorder(recordedBlob);
      return recorder;
    },
    createObjectURL() {
      return 'blob:retelling';
    },
    revokeObjectURL() {},
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

test('startApp loads config, renders the shell, and keeps languages synced while enabled', async () => {
  const shell = createShell();
  const config = createConfig();
  const { fetchStub } = createFetchStub(createResponse(config));

  await startApp(shell.document, fetchStub);

  assert.equal(shell.elements.get('[data-text-language-input]').value, 'uk');
  assert.equal(shell.elements.get('[data-analysis-language-input]').value, 'uk');
  assert.equal(shell.elements.get('[data-text-model-select]').value, 'gemini-3-flash-preview');
  assert.equal(
    shell.elements.get('[data-analysis-model-select]').value,
    'gemini-3.1-flash-lite-preview',
  );
  assert.equal(shell.elements.get('[data-same-model-toggle]').checked, false);
  assert.equal(shell.elements.get('[data-thinking-level-select]').value, 'medium');
  assert.equal(shell.elements.get('[data-topic-input]').value, 'Morning routines');
  assert.match(shell.elements.get('[data-settings-status]').textContent, /stored/i);
  assert.equal(shell.elements.get('[data-settings-panel]').hidden, true);
  assert.deepEqual(
    shell.elements.get('[data-text-model-select]').children.map((option) => option.textContent),
    ['Gemini 3 Flash', 'Gemini 2.5 Flash (250 RPD hint)'],
  );

  await shell.elements.get('[data-open-settings-button]').click();
  assert.equal(shell.elements.get('[data-settings-panel]').hidden, false);

  shell.elements.get('[data-text-language-input]').value = 'pl';
  await shell.elements.get('[data-text-language-input]').input();
  assert.equal(shell.elements.get('[data-analysis-language-input]').value, 'pl');

  shell.elements.get('[data-same-language-toggle]').checked = false;
  await shell.elements.get('[data-same-language-toggle]').change();
  shell.elements.get('[data-text-language-input]').value = 'de';
  await shell.elements.get('[data-text-language-input]').input();
  assert.equal(shell.elements.get('[data-analysis-language-input]').value, 'pl');

  await shell.elements.get('[data-close-settings-button]').click();
  assert.equal(shell.elements.get('[data-settings-panel]').hidden, true);
});

test('startApp disables the analysis model selector and saves a coherent gemini payload when same model is enabled', async () => {
  const shell = createShell();
  const config = createConfig();
  const exercise = createExercise();
  const { fetchStub, calls } = createFetchStub(
    createResponse(config),
    createResponse({
      ...config,
      gemini: {
        ...config.gemini,
        text_model: 'gemini-2.5-flash',
        analysis_model: 'gemini-2.5-flash',
        same_model_for_analysis: true,
        model: 'gemini-2.5-flash',
      },
    }),
    createResponse(exercise),
  );

  await startApp(shell.document, fetchStub);

  shell.elements.get('[data-text-model-select]').value = 'gemini-2.5-flash';
  await shell.elements.get('[data-text-model-select]').change();
  shell.elements.get('[data-analysis-model-select]').value = 'gemini-3.1-flash-lite-preview';
  await shell.elements.get('[data-analysis-model-select]').change();
  shell.elements.get('[data-same-model-toggle]').checked = true;
  await shell.elements.get('[data-same-model-toggle]').change();

  assert.equal(shell.elements.get('[data-analysis-model-select]').disabled, true);
  assert.equal(shell.elements.get('[data-analysis-model-select]').value, 'gemini-2.5-flash');

  await shell.elements.get('[data-generate-button]').click();

  assert.deepEqual(JSON.parse(calls[1].options.body).gemini, {
    text_model: 'gemini-2.5-flash',
    analysis_model: 'gemini-2.5-flash',
    same_model_for_analysis: true,
    text_thinking_level: 'medium',
    api_key: null,
  });
});

test('startApp saves config, generates text, advances steps, supports reuse, and resets home', async () => {
  const shell = createShell();
  const config = createConfig();
  const exercise = createExercise();
  const { fetchStub, calls } = createFetchStub(
    createResponse(config),
    createResponse(config),
    createResponse(exercise),
  );

  await startApp(shell.document, fetchStub);

  shell.elements.get('[data-topic-input]').value = '';
  await shell.elements.get('[data-reuse-topic-button]').click();
  await shell.elements.get('[data-generate-button]').click();

  assert.deepEqual(
    calls.map((call) => call.url),
    ['/api/config', '/api/config', '/api/generate-text'],
  );
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    text_language: 'uk',
    analysis_language: 'uk',
    same_language_for_analysis: true,
    ui_language: 'uk',
    last_topic_prompt: 'Morning routines',
    session_limit: 10,
    keep_last_audio: false,
    gemini: {
      text_model: 'gemini-3-flash-preview',
      analysis_model: 'gemini-3.1-flash-lite-preview',
      same_model_for_analysis: false,
      text_thinking_level: 'medium',
      api_key: null,
    },
    langfuse: {
      host: null,
      public_key: null,
      secret_key: null,
    },
  });
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    language: 'uk',
    analysis_language: 'uk',
    topic_prompt: '',
    reuse_last_topic: true,
  });
  assert.equal(shell.elements.get('[data-step-label]').textContent, 'Step 1 of 3');
  assert.match(shell.elements.get('[data-step-title]').textContent, /warm-up/i);
  assert.equal(shell.elements.get('[data-exercise-text]').textContent, exercise.text);

  await shell.elements.get('[data-next-step-button]').click();
  assert.equal(shell.elements.get('[data-step-label]').textContent, 'Step 2 of 3');

  await shell.elements.get('[data-next-step-button]').click();
  assert.equal(shell.elements.get('[data-step-label]').textContent, 'Step 3 of 3');

  await shell.elements.get('[data-reset-button]').click();
  assert.equal(shell.elements.get('[data-status-message]').textContent, 'Ready to generate a guided exercise.');
  assert.match(shell.elements.get('[data-exercise-text]').textContent, /appear here/i);
});

test('startApp clears reuse intent when the user types a fresh topic before generating', async () => {
  const shell = createShell();
  const config = createConfig();
  const exercise = createExercise({ topic_prompt: 'Fresh topic' });
  const { fetchStub, calls } = createFetchStub(
    createResponse(config),
    createResponse(config),
    createResponse(exercise),
  );

  await startApp(shell.document, fetchStub);

  shell.elements.get('[data-topic-input]').value = '';
  await shell.elements.get('[data-reuse-topic-button]').click();
  assert.match(shell.elements.get('[data-status-message]').textContent, /reuse/i);

  shell.elements.get('[data-topic-input]').value = 'Fresh topic';
  await shell.elements.get('[data-topic-input]').input();
  assert.equal(shell.elements.get('[data-status-message]').textContent, 'Ready to generate a guided exercise.');

  await shell.elements.get('[data-generate-button]').click();

  assert.deepEqual(JSON.parse(calls[2].options.body), {
    language: 'uk',
    analysis_language: 'uk',
    topic_prompt: 'Fresh topic',
    reuse_last_topic: false,
  });
});

test('startApp clears stored API keys and refreshes the rendered status', async () => {
  const shell = createShell();
  const loadedConfig = createConfig();
  const clearedConfig = createConfig({
    gemini: {
      model: 'gemini-3-flash-preview',
      text_model: 'gemini-3-flash-preview',
      analysis_model: 'gemini-3.1-flash-lite-preview',
      same_model_for_analysis: false,
      text_thinking_level: 'medium',
      has_api_key: false,
      api_key_source: 'none',
      available_models: loadedConfig.gemini.available_models,
    },
  });
  const { fetchStub, calls } = createFetchStub(
    createResponse(loadedConfig),
    createResponse(clearedConfig),
  );

  await startApp(shell.document, fetchStub);
  await shell.elements.get('[data-clear-api-key-button]').click();

  assert.deepEqual(
    calls.map((call) => ({ url: call.url, method: call.options.method ?? 'GET' })),
    [
      { url: '/api/config', method: 'GET' },
      { url: '/api/config/api-key', method: 'DELETE' },
    ],
  );
  assert.match(shell.elements.get('[data-settings-status]').textContent, /not stored/i);
});

test('startApp shows friendly messages for load, generate, and clear failures', async () => {
  const loadShell = createShell();
  const generateShell = createShell();
  const clearShell = createShell();

  await startApp(loadShell.document, async () => {
    throw new Error('load failed');
  });
  assert.match(loadShell.elements.get('[data-status-message]').textContent, /could not load/i);

  const { fetchStub: generateFetch } = createFetchStub(
    createResponse(createConfig()),
    createResponse(createConfig()),
    new Error('generation failed'),
  );
  await startApp(generateShell.document, generateFetch);
  generateShell.elements.get('[data-topic-input]').value = 'Keep my topic';
  await generateShell.elements.get('[data-topic-input]').input();
  generateShell.elements.get('[data-text-model-select]').value = 'gemini-2.5-flash';
  await generateShell.elements.get('[data-text-model-select]').change();
  await generateShell.elements.get('[data-generate-button]').click();
  assert.match(generateShell.elements.get('[data-status-message]').textContent, /could not generate/i);
  assert.equal(generateShell.elements.get('[data-topic-input]').value, 'Keep my topic');
  assert.equal(generateShell.elements.get('[data-text-model-select]').value, 'gemini-2.5-flash');

  const { fetchStub: clearFetch } = createFetchStub(
    createResponse(createConfig()),
    new Error('clear failed'),
  );
  await startApp(clearShell.document, clearFetch);
  await clearShell.elements.get('[data-clear-api-key-button]').click();
  assert.match(clearShell.elements.get('[data-settings-status]').textContent, /could not clear/i);
});

test('startApp shows backend generation detail when the API returns a calm 400 message', async () => {
  const shell = createShell();
  const { fetchStub } = createFetchStub(
    createResponse(createConfig()),
    createResponse(createConfig()),
    createResponse({ detail: 'Gemini API key was rejected. Update it and try again.' }, false, 400),
  );

  await startApp(shell.document, fetchStub);
  await shell.elements.get('[data-generate-button]').click();

  assert.equal(
    shell.elements.get('[data-status-message]').textContent,
    'Gemini API key was rejected. Update it and try again.',
  );
});

test('startApp keeps manual model choices available when config loading fails', async () => {
  const shell = createShell();

  await startApp(shell.document, async () => {
    throw new Error('load failed');
  });

  assert.match(shell.elements.get('[data-status-message]').textContent, /could not load/i);
  assert.equal(shell.elements.get('[data-text-model-select]').value, 'gemini-3-flash-preview');
  assert.equal(shell.elements.get('[data-analysis-model-select]').value, 'gemini-3-flash-preview');
  assert.deepEqual(
    shell.elements.get('[data-text-model-select]').children.map((option) => option.textContent),
    ['Gemini 3 Flash', 'Gemini 3.1 Flash-Lite Preview', 'Gemini 2.5 Flash (250 RPD hint)', 'Gemini 2.5 Flash-Lite (1000 RPD hint)'],
  );
});

test('startApp records, uploads, renders review, and clears review on record again', async () => {
  const shell = createShell();
  const config = createConfig();
  const exercise = createExercise();
  const review = {
    summary: 'Clear retelling with a few rushed transitions.',
    clarity: 'Mostly clear.',
    pace: 'Slightly fast near the end.',
    hesitations: ['A short pause before the final sentence.'],
    recommendations: ['Slow down the ending.', 'Keep sentence openings steady.'],
  };
  const { fetchStub, calls } = createFetchStub(
    createResponse(config),
    createResponse(config),
    createResponse(exercise),
    createResponse(review),
  );
  const recordingApi = createRecordingApi();

  await startApp(shell.document, fetchStub, recordingApi);
  await shell.elements.get('[data-generate-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-next-step-button]').click();

  await shell.elements.get('[data-start-recording-button]').click();
  assert.match(shell.elements.get('[data-recording-status]').textContent, /recording/i);

  await shell.elements.get('[data-stop-recording-button]').click();
  assert.equal(shell.elements.get('[data-recording-preview]').hidden, false);
  assert.equal(shell.elements.get('[data-recording-preview]').src, 'blob:retelling');
  assert.equal(recordingApi.stream.getTracks()[0].stopCalls, 1);

  await shell.elements.get('[data-analyze-recording-button]').click();

  assert.equal(calls[3].url, '/api/analyze-recording');
  assert.equal(shell.elements.get('[data-review-panel]').hidden, false);
  assert.equal(shell.elements.get('[data-review-summary]').textContent, review.summary);

  await shell.elements.get('[data-record-again-button]').click();
  assert.equal(shell.elements.get('[data-review-panel]').hidden, true);
  assert.equal(shell.elements.get('[data-recording-preview]').hidden, true);
});

test('startApp releases microphone tracks when reset interrupts recording', async () => {
  const shell = createShell();
  const config = createConfig();
  const exercise = createExercise();
  const { fetchStub } = createFetchStub(
    createResponse(config),
    createResponse(config),
    createResponse(exercise),
  );
  const recordingApi = createRecordingApi();

  await startApp(shell.document, fetchStub, recordingApi);
  await shell.elements.get('[data-generate-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-start-recording-button]').click();

  await shell.elements.get('[data-reset-button]').click();

  assert.equal(recordingApi.stream.getTracks()[0].stopCalls, 1);
});

test('startApp ignores a stale recorder stop after reset clears the recording', async () => {
  const shell = createShell();
  const config = createConfig();
  const exercise = createExercise();
  const { fetchStub } = createFetchStub(
    createResponse(config),
    createResponse(config),
    createResponse(exercise),
  );
  const recordingApi = createRecordingApi();

  await startApp(shell.document, fetchStub, recordingApi);
  await shell.elements.get('[data-generate-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-start-recording-button]').click();

  const staleRecorder = recordingApi.recorder;
  await shell.elements.get('[data-reset-button]').click();
  staleRecorder.stop();

  assert.equal(shell.elements.get('[data-recording-preview]').hidden, true);
  assert.equal(shell.elements.get('[data-recording-preview]').src, '');
  assert.equal(shell.elements.get('[data-status-message]').textContent, 'Ready to generate a guided exercise.');
});

test('startApp ignores an outdated permission request after reset clears the exercise', async () => {
  const shell = createShell();
  const config = createConfig();
  const exercise = createExercise();
  const { fetchStub } = createFetchStub(
    createResponse(config),
    createResponse(config),
    createResponse(exercise),
  );
  const recordingApi = createRecordingApi();
  const pendingPermission = createDeferred();
  let recorderCreations = 0;

  recordingApi.getUserMedia = async () => await pendingPermission.promise;
  recordingApi.createMediaRecorder = () => {
    recorderCreations += 1;
    return new FakeRecorder(new Blob(['voice sample'], { type: 'audio/webm' }));
  };

  await startApp(shell.document, fetchStub, recordingApi);
  await shell.elements.get('[data-generate-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-next-step-button]').click();

  const startPromise = shell.elements.get('[data-start-recording-button]').click();
  await shell.elements.get('[data-reset-button]').click();
  pendingPermission.resolve(recordingApi.stream);
  await startPromise;

  assert.equal(recorderCreations, 0);
  assert.equal(shell.elements.get('[data-recording-controls]').hidden, true);
  assert.equal(shell.elements.get('[data-recording-preview]').hidden, true);
  assert.equal(shell.elements.get('[data-status-message]').textContent, 'Ready to generate a guided exercise.');
});

test('startApp preserves the recorded retelling when upload fails', async () => {
  const shell = createShell();
  const config = createConfig();
  const exercise = createExercise();
  const { fetchStub } = createFetchStub(
    createResponse(config),
    createResponse(config),
    createResponse(exercise),
    new Error('upload failed'),
  );

  await startApp(shell.document, fetchStub, createRecordingApi());
  await shell.elements.get('[data-generate-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-next-step-button]').click();
  await shell.elements.get('[data-start-recording-button]').click();
  await shell.elements.get('[data-stop-recording-button]').click();

  await shell.elements.get('[data-analyze-recording-button]').click();

  assert.equal(shell.elements.get('[data-recording-preview]').hidden, false);
  assert.equal(shell.elements.get('[data-analyze-recording-button]').hidden, false);
  assert.match(shell.elements.get('[data-recording-status]').textContent, /could not upload/i);
});
