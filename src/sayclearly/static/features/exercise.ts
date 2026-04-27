import {
  RequestError,
  fetchConfig,
  generateExercise,
  getRequestErrorMessage,
  getRequestErrorMessageWithDetail,
  saveConfig,
} from '../api_client.js';
import {
  advanceExerciseStep,
  applyGeneratedExercise,
  applyGenerationError,
  applyLoadedConfig,
  buildConfigUpdatePayload,
  buildGenerateRequest,
  startGeneration,
} from '../app_state.js';
import { type AppContext } from '../app_context.js';
import { GENERATING_STATUS } from '../render/index.js';
import { readSettings } from './settings.js';

const LOAD_ERROR_STATUS =
  'Could not load your saved settings. You can still enter them manually.';
const GENERATE_ERROR_STATUS =
  'Could not generate a guided exercise. Check your settings and try again.';

export interface ExerciseFeature {
  attachHandlers(): void;
}

export function createExerciseFeature(ctx: AppContext): ExerciseFeature {
  const { elements, fetchImpl, state } = ctx;

  const stopGenerationTicker = (): void => {
    if (state.generationTickerId !== null) {
      clearInterval(state.generationTickerId);
      state.generationTickerId = null;
    }
    state.generationStartedAt = null;
  };

  const handleNextStep = (): void => {
    state.model = advanceExerciseStep(state.model);
    if (state.model.flow === 'step_3_retell_ready') {
      ctx.closeStep3Details();
    }
    ctx.rerender();
  };

  const handleCancelGenerate = (): void => {
    state.activeAbortController?.abort();
  };

  const handleGenerate = async (): Promise<void> => {
    const settings = readSettings(elements);
    state.model = {
      ...state.model,
      settings,
    };
    state.model = startGeneration(state.model);

    const controller = new AbortController();
    state.activeAbortController = controller;
    state.generationStartedAt = Date.now();
    const tickGeneration = (): void => {
      if (state.generationStartedAt === null) {
        return;
      }
      const elapsed = Math.floor((Date.now() - state.generationStartedAt) / 1000);
      elements.statusMessage.textContent = `${GENERATING_STATUS} (${elapsed}s)`;
    };
    state.generationTickerId = setInterval(tickGeneration, 1000);
    ctx.rerender();

    try {
      let configForSave = state.model.config;
      if (!state.hasLoadedConfig) {
        try {
          configForSave = await fetchConfig(fetchImpl, controller.signal);
          state.model = {
            ...applyLoadedConfig(state.model, configForSave),
            settings,
          };
          state.hasLoadedConfig = true;
        } catch (error) {
          if (controller.signal.aborted) {
            throw error;
          }
          throw new RequestError(
            'Request failed: /api/config',
            getRequestErrorMessage(error, LOAD_ERROR_STATUS),
          );
        }
      }

      const savedConfig = await saveConfig(
        fetchImpl,
        buildConfigUpdatePayload(configForSave, settings),
        controller.signal,
      );
      state.hasLoadedConfig = true;
      state.model = {
        ...state.model,
        config: savedConfig,
        settings,
      };

      const exercise = await generateExercise(
        fetchImpl,
        buildGenerateRequest(settings),
        controller.signal,
      );
      state.model = applyGeneratedExercise(state.model, exercise);
    } catch (error) {
      if (controller.signal.aborted) {
        state.model = {
          ...state.model,
          flow: 'home',
          error_message: null,
        };
      } else {
        state.model = applyGenerationError(
          state.model,
          getRequestErrorMessageWithDetail(error, GENERATE_ERROR_STATUS),
        );
      }
    } finally {
      stopGenerationTicker();
      if (state.activeAbortController === controller) {
        state.activeAbortController = null;
      }
    }

    ctx.rerender();
  };

  const attachHandlers = (): void => {
    elements.nextStepButton.addEventListener('click', handleNextStep);
    elements.cancelGenerateButton.addEventListener('click', handleCancelGenerate);
    elements.generateButton.addEventListener('click', handleGenerate);
  };

  return { attachHandlers };
}
