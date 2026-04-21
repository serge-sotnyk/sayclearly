import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyGeneratedExercise,
  applyGenerationError,
  advanceExerciseStep,
  buildConfigUpdatePayload,
  buildGenerateRequest,
  createInitialAppModel,
  syncAnalysisLanguage,
} from '../src/sayclearly/static/dist/app_state.js';

const publicConfig = {
  version: 3,
  text_language: 'uk',
  analysis_language: 'en',
  same_language_for_analysis: false,
  ui_language: 'uk',
  last_topic_prompt: 'Keep the original config topic',
  session_limit: 8,
  keep_last_audio: true,
  gemini: {
    model: 'gemini-2.5-flash',
    has_api_key: true,
    api_key_source: 'stored',
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

test('syncAnalysisLanguage copies text language when toggle is enabled', () => {
  const settings = {
    text_language: 'pl',
    analysis_language: 'uk',
    same_language_for_analysis: true,
    topic_prompt: 'A short weather forecast',
    reuse_last_topic: false,
  };

  assert.deepEqual(syncAnalysisLanguage(settings), {
    ...settings,
    analysis_language: 'pl',
  });
});

test('applyGeneratedExercise moves flow to step_1_slow', () => {
  const exercise = {
    text_language: 'uk',
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
    text_language: 'uk',
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

test('buildGenerateRequest and buildConfigUpdatePayload preserve current config values outside stage 3 form', () => {
  const settings = {
    text_language: 'pl',
    analysis_language: 'pl',
    same_language_for_analysis: true,
    topic_prompt: 'Describe a quiet library',
    reuse_last_topic: true,
  };

  assert.deepEqual(buildGenerateRequest(settings), {
    text_language: 'pl',
    analysis_language: 'pl',
    topic_prompt: 'Describe a quiet library',
    reuse_last_topic: true,
  });

  assert.deepEqual(buildConfigUpdatePayload(publicConfig, settings), {
    ...publicConfig,
    text_language: 'pl',
    analysis_language: 'pl',
    same_language_for_analysis: true,
    last_topic_prompt: 'Describe a quiet library',
  });
});
