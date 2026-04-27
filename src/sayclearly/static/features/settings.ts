import { deleteApiKey } from '../api_client.js';
import {
  applyLoadedConfig,
  createInitialAppModel,
  syncAnalysisLanguage,
  syncAnalysisModel,
  type SettingsFormState,
} from '../app_state.js';
import { type AppContext } from '../app_context.js';
import { type ShellElements } from '../dom_elements.js';

const CLEAR_ERROR_STATUS = 'Could not clear the stored API key. Try again.';

export function readSettings(elements: ShellElements): SettingsFormState {
  return syncAnalysisModel(
    syncAnalysisLanguage({
      text_language: elements.textLanguageInput.value.trim(),
      analysis_language: elements.analysisLanguageInput.value.trim(),
      same_language_for_analysis: elements.sameLanguageToggle.checked,
      text_model: elements.textModelSelect.value,
      analysis_model: elements.analysisModelSelect.value,
      same_model_for_analysis: elements.sameModelToggle.checked,
      text_thinking_level: elements.thinkingLevelSelect
        .value as SettingsFormState['text_thinking_level'],
      topic_prompt: elements.topicInput.value,
    }),
  );
}

export interface SettingsFeature {
  attachHandlers(): void;
}

export function createSettingsFeature(ctx: AppContext): SettingsFeature {
  const { documentRef, elements, fetchImpl, state } = ctx;

  const updateSettings = (nextSettings: SettingsFormState): void => {
    state.model = {
      ...state.model,
      settings: nextSettings,
    };
    ctx.rerender();
  };

  const refreshFromInputs = (): void => {
    updateSettings(readSettings(elements));
  };

  const handleClearApiKey = async (): Promise<void> => {
    try {
      const config = await deleteApiKey(fetchImpl);
      state.model = {
        ...state.model,
        config,
        error_message: null,
      };
      state.hasLoadedConfig = true;
      elements.apiKeyInput.value = '';
      ctx.rerender();
    } catch {
      elements.settingsStatus.textContent = CLEAR_ERROR_STATUS;
    }
  };

  const handleReset = (): void => {
    ctx.clearRecordingArtifacts();
    const resetModel = createInitialAppModel();
    state.model = applyLoadedConfig(resetModel, state.model.config);
    ctx.rerender();
  };

  const attachHandlers = (): void => {
    elements.openSettingsButton.addEventListener('click', () => {
      state.isSettingsOpen = true;
      ctx.rerender();
    });

    elements.closeSettingsButton.addEventListener('click', () => {
      state.isSettingsOpen = false;
      ctx.rerender();
    });

    for (const input of [
      elements.textLanguageInput,
      elements.analysisLanguageInput,
    ] as const) {
      input.addEventListener('input', refreshFromInputs);
    }

    for (const select of [
      elements.textModelSelect,
      elements.analysisModelSelect,
      elements.thinkingLevelSelect,
    ] as const) {
      select.addEventListener('change', refreshFromInputs);
    }

    for (const toggle of [
      elements.sameModelToggle,
      elements.sameLanguageToggle,
    ] as const) {
      toggle.addEventListener('change', refreshFromInputs);
    }

    elements.topicInput.addEventListener('input', refreshFromInputs);

    elements.clearApiKeyButton.addEventListener('click', handleClearApiKey);

    elements.resetButton.addEventListener('click', handleReset);

    elements.apiKeyPopoverToggle.addEventListener('click', (event) => {
      event.preventDefault();
      const isOpen = elements.apiKeyPopover.classList.toggle('is-open');
      elements.apiKeyPopoverToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    documentRef.addEventListener('click', (event) => {
      if (!elements.apiKeyPopover.classList.contains('is-open')) {
        return;
      }
      const target = event.target as Node | null;
      if (target && elements.apiKeyPopover.contains(target)) {
        return;
      }
      elements.apiKeyPopover.classList.remove('is-open');
      elements.apiKeyPopoverToggle.setAttribute('aria-expanded', 'false');
    });
  };

  return { attachHandlers };
}
