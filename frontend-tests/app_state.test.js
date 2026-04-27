import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAnalysisError,
  applyAnalysisResult,
  applyLoadedConfig,
  applyGeneratedExercise,
  applyGenerationError,
  applyRecordingError,
  advanceExerciseStep,
  buildConfigUpdatePayload,
  buildGenerateRequest,
  createInitialAppModel,
  dedupeRecentTopics,
  filterRecentTopics,
  findRecentTopicMatch,
  markRecordingStarted,
  pushRecentTopic,
  resetRecording,
  startRecordingAnalysis,
  startRecordingRequest,
  storeRecordedAudio,
  syncAnalysisLanguage,
} from '../src/sayclearly/static/dist/app_state.js';

const publicConfig = {
  version: 3,
  text_language: 'uk',
  analysis_language: 'en',
  same_language_for_analysis: false,
  ui_language: 'uk',
  session_limit: 8,
  keep_last_audio: true,
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
      {
        id: 'gemini-2.5-flash-lite',
        label: 'Gemini 2.5 Flash-Lite',
        free_tier_requests_per_day_hint: 1000,
      },
    ],
  },
  langfuse: {
    host: 'https://langfuse.example',
    enabled: true,
    has_public_key: true,
    has_secret_key: true,
    public_key_source: 'stored',
    secret_key_source: 'stored',
  },
};

const review = {
  summary: 'Strong retelling with a few rushed phrases.',
  clarity: 'Mostly clear consonants with occasional dropped endings.',
  pace: 'A little too fast in the middle section.',
  hesitations: ['Paused before the last sentence'],
  recommendations: ['Slow down after the first sentence', 'Finish final consonants more clearly'],
};

const analysisResult = {
  review,
  analysis: {
    clarity_score: 78,
    pace_score: 61,
    hesitations: [
      {
        start: 9.3,
        end: 10.1,
        note: 'Paused before the last sentence',
      },
    ],
    summary: ['Strong retelling with a few rushed phrases.'],
  },
};

const savedSession = {
  id: 'session-1',
  created_at: '2026-04-24T09:30:00Z',
  language: 'uk',
  topic_prompt: 'Morning routines',
  text: 'Wake up, stretch, and greet the day clearly.',
  analysis: analysisResult.analysis,
};

function createRetellingReadyModel() {
  const exercise = {
    language: 'uk',
    analysis_language: 'uk',
    topic_prompt: 'Morning routines',
    text: 'Wake up, stretch, and greet the day clearly.',
  };

  return advanceExerciseStep(
    advanceExerciseStep(applyGeneratedExercise(createInitialAppModel(), exercise)),
  );
}

test('syncAnalysisLanguage copies text language when toggle is enabled', () => {
  const settings = {
    text_language: 'pl',
    analysis_language: 'uk',
    same_language_for_analysis: true,
    text_model: 'gemini-3-flash-preview',
    analysis_model: 'gemini-3.1-flash-lite-preview',
    same_model_for_analysis: false,
    text_thinking_level: 'medium',
    topic_prompt: 'A short weather forecast',
  };

  assert.deepEqual(syncAnalysisLanguage(settings), {
    ...settings,
    analysis_language: 'pl',
  });
});

test('applyGeneratedExercise moves flow to step_1_slow', () => {
  const exercise = {
    language: 'uk',
    analysis_language: 'uk',
    topic_prompt: 'Morning routines',
    text: 'Wake up, stretch, and greet the day clearly.',
  };

  const updatedModel = applyGeneratedExercise(createInitialAppModel(), exercise);

  assert.equal(updatedModel.flow, 'step_1_slow');
  assert.deepEqual(updatedModel.generated_exercise, exercise);
  assert.equal(updatedModel.error_message, null);
});

test('advanceExerciseStep stops at step_3_retell_ready', () => {
  const exercise = {
    language: 'uk',
    analysis_language: 'uk',
    topic_prompt: 'A mountain trail',
    text: 'First read slowly, then naturally, then retell it.',
  };

  const stepOneModel = applyGeneratedExercise(createInitialAppModel(), exercise);
  const stepTwoModel = advanceExerciseStep(stepOneModel);
  const stepThreeModel = advanceExerciseStep(stepTwoModel);
  const stillStepThreeModel = advanceExerciseStep(stepThreeModel);

  assert.equal(stepTwoModel.flow, 'step_2_natural');
  assert.equal(stepThreeModel.flow, 'step_3_retell_ready');
  assert.equal(stillStepThreeModel.flow, 'step_3_retell_ready');
});

test('applyGenerationError moves flow into error', () => {
  const updatedModel = applyGenerationError(createInitialAppModel(), 'Generation failed');

  assert.equal(updatedModel.flow, 'error');
  assert.equal(updatedModel.error_message, 'Generation failed');
});

test('applyLoadedConfig seeds settings from the public config and starts with a blank topic', () => {
  const model = createInitialAppModel();
  const loadedModel = applyLoadedConfig(model, publicConfig);

  assert.equal(loadedModel.settings.topic_prompt, '');
  assert.equal(loadedModel.settings.text_language, 'uk');
});

test('buildGenerateRequest and buildConfigUpdatePayload preserve current config values outside stage 3 form', () => {
  const settings = {
    text_language: 'pl',
    analysis_language: 'pl',
    same_language_for_analysis: true,
    text_model: 'gemini-3-flash-preview',
    analysis_model: 'gemini-3.1-flash-lite-preview',
    same_model_for_analysis: false,
    text_thinking_level: 'medium',
    topic_prompt: 'Describe a quiet library',
  };

  assert.deepEqual(buildGenerateRequest(settings), {
    language: 'pl',
    analysis_language: 'pl',
    topic_prompt: 'Describe a quiet library',
  });

  assert.deepEqual(buildConfigUpdatePayload(publicConfig, settings), {
    text_language: 'pl',
    analysis_language: 'pl',
    same_language_for_analysis: true,
    ui_language: 'uk',
    session_limit: 8,
    keep_last_audio: true,
    gemini: {
      text_model: 'gemini-3-flash-preview',
      analysis_model: 'gemini-3.1-flash-lite-preview',
      same_model_for_analysis: false,
      text_thinking_level: 'medium',
      api_key: null,
    },
    langfuse: {
      host: 'https://langfuse.example',
      public_key: null,
      secret_key: null,
    },
  });
});

test('buildConfigUpdatePayload keeps analysis model aligned when same model is enabled', () => {
  const settings = {
    text_language: 'uk',
    analysis_language: 'en',
    same_language_for_analysis: false,
    text_model: 'gemini-2.5-flash',
    analysis_model: 'gemini-3.1-flash-lite-preview',
    same_model_for_analysis: true,
    text_thinking_level: 'medium',
    topic_prompt: 'Describe a market square',
  };

  const config = {
    ...publicConfig,
    gemini: {
      ...publicConfig.gemini,
      text_model: 'gemini-2.5-flash',
      analysis_model: 'gemini-3.1-flash-lite-preview',
      same_model_for_analysis: true,
    },
  };

  assert.deepEqual(buildConfigUpdatePayload(config, settings).gemini, {
    text_model: 'gemini-2.5-flash',
    analysis_model: 'gemini-2.5-flash',
    same_model_for_analysis: true,
    text_thinking_level: 'medium',
    api_key: null,
  });
});

test('startRecordingRequest moves to requesting_microphone and clears stale recording state', () => {
  const staleModel = {
    ...createRetellingReadyModel(),
    has_recording: true,
    recording_error: 'Microphone blocked',
    review,
  };

  const updatedModel = startRecordingRequest(staleModel);

  assert.equal(updatedModel.flow, 'requesting_microphone');
  assert.equal(updatedModel.has_recording, false);
  assert.equal(updatedModel.recording_error, null);
  assert.equal(updatedModel.review, null);
});

test('storeRecordedAudio after recording start ends in recorded with a saved recording flag', () => {
  const updatedModel = storeRecordedAudio(
    markRecordingStarted(startRecordingRequest(createRetellingReadyModel())),
  );

  assert.equal(updatedModel.flow, 'recorded');
  assert.equal(updatedModel.has_recording, true);
  assert.equal(updatedModel.recording_error, null);
});

test('applyAnalysisError clears stale review data and preserves the recording flag', () => {
  const recordedModel = storeRecordedAudio(
    markRecordingStarted(startRecordingRequest(createRetellingReadyModel())),
  );
  const reviewedModel = applyAnalysisResult(
    startRecordingAnalysis(recordedModel),
    analysisResult,
    savedSession,
  );
  const analyzingModel = startRecordingAnalysis(reviewedModel);

  assert.equal(analyzingModel.review, null);

  const updatedModel = applyAnalysisError(analyzingModel, 'Upload failed');

  assert.equal(updatedModel.flow, 'recorded');
  assert.equal(updatedModel.has_recording, true);
  assert.equal(updatedModel.recording_error, 'Upload failed');
  assert.equal(updatedModel.review, null);
});

test('applyAnalysisResult enters review and resetRecording clears recording state', () => {
  const recordedModel = storeRecordedAudio(
    markRecordingStarted(startRecordingRequest(createRetellingReadyModel())),
  );
  const reviewedModel = applyAnalysisResult(
    startRecordingAnalysis(recordedModel),
    analysisResult,
    savedSession,
  );
  const resetModel = resetRecording(reviewedModel);

  assert.equal(reviewedModel.flow, 'review');
  assert.equal(reviewedModel.has_recording, true);
  assert.deepEqual(reviewedModel.review, review);
  assert.deepEqual(reviewedModel.latest_session, savedSession);
  assert.equal(reviewedModel.recording_error, null);

  assert.equal(resetModel.flow, 'step_3_retell_ready');
  assert.equal(resetModel.has_recording, false);
  assert.equal(resetModel.review, null);
  assert.equal(resetModel.recording_error, null);
});

test('dedupeRecentTopics drops empty topics and keeps the freshest casing', () => {
  const entries = [
    { topic: 'rust facts', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
    { topic: '   ', text_language: 'English', analysis_language: 'English' },
    { topic: 'RUST FACTS', text_language: 'English', analysis_language: 'English' },
    { topic: 'ordering coffee', text_language: 'English', analysis_language: 'English' },
  ];

  assert.deepEqual(dedupeRecentTopics(entries), [
    { topic: 'rust facts', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
    { topic: 'ordering coffee', text_language: 'English', analysis_language: 'English' },
  ]);
});

test('pushRecentTopic prepends the new entry and respects the optional limit', () => {
  const existing = [
    { topic: 'rust facts', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
    { topic: 'ordering coffee', text_language: 'English', analysis_language: 'English' },
  ];

  const next = pushRecentTopic(
    existing,
    { topic: 'history of kyiv', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
    2,
  );

  assert.deepEqual(next, [
    { topic: 'history of kyiv', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
    { topic: 'rust facts', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
  ]);

  const unbounded = pushRecentTopic(existing, {
    topic: 'history of kyiv',
    text_language: 'Ukrainian',
    analysis_language: 'Ukrainian',
  });

  assert.equal(unbounded.length, 3);
  assert.equal(unbounded[0].topic, 'history of kyiv');
});

test('pushRecentTopic moves an existing topic to the front with the freshest casing', () => {
  const existing = [
    { topic: 'rust facts', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
    { topic: 'ordering coffee', text_language: 'English', analysis_language: 'English' },
  ];

  const next = pushRecentTopic(existing, {
    topic: 'Ordering Coffee',
    text_language: 'English',
    analysis_language: 'English',
  });

  assert.deepEqual(next, [
    { topic: 'Ordering Coffee', text_language: 'English', analysis_language: 'English' },
    { topic: 'rust facts', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
  ]);
});

test('findRecentTopicMatch matches case-insensitively after trim', () => {
  const entries = [
    { topic: 'rust facts', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
    { topic: 'ordering coffee', text_language: 'English', analysis_language: 'English' },
  ];

  assert.deepEqual(findRecentTopicMatch(entries, '  RUST FACTS  '), {
    topic: 'rust facts',
    text_language: 'Ukrainian',
    analysis_language: 'Ukrainian',
  });
  assert.equal(findRecentTopicMatch(entries, 'something else'), null);
  assert.equal(findRecentTopicMatch(entries, '   '), null);
});

test('filterRecentTopics returns substring matches preserving order, empty for blank query', () => {
  const entries = [
    { topic: 'rust facts', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
    { topic: 'history of kyiv', text_language: 'Ukrainian', analysis_language: 'Ukrainian' },
    { topic: 'ordering coffee', text_language: 'English', analysis_language: 'English' },
  ];

  assert.deepEqual(filterRecentTopics(entries, 'FACTS').map((entry) => entry.topic), [
    'rust facts',
  ]);
  assert.deepEqual(filterRecentTopics(entries, 'o').map((entry) => entry.topic), [
    'history of kyiv',
    'ordering coffee',
  ]);
  assert.deepEqual(filterRecentTopics(entries, '   '), []);
});
