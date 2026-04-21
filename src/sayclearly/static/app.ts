import {
  advanceExerciseStep,
  applyGeneratedExercise,
  applyGenerationError,
  applyLoadedConfig,
  buildConfigUpdatePayload,
  buildGenerateRequest,
  createInitialAppModel,
  startGeneration,
  syncAnalysisLanguage,
  type AppModel,
  type GeneratedExercise,
  type PublicConfig,
  type SettingsFormState,
} from './app_state.js';

const READY_STATUS = 'Ready to generate a guided exercise.';
const LOADING_STATUS = 'Loading your saved settings...';
const GENERATING_STATUS = 'Generating your guided exercise...';
const LOAD_ERROR_STATUS = 'Could not load your saved settings. You can still enter them manually.';
const GENERATE_ERROR_STATUS = 'Could not generate a guided exercise. Check your settings and try again.';
const CLEAR_ERROR_STATUS = 'Could not clear the stored API key. Try again.';
const REUSE_STATUS = 'The next generation will reuse your last saved topic.';
const EXERCISE_PLACEHOLDER =
  'Your generated exercise text will appear here when the frontend bundle is connected.';

const STEP_CONTENT = {
  step_1_slow: {
    label: 'Step 1 of 3',
    title: 'Warm-up response',
    instruction:
      'Read the prompt out loud once, then repeat it with a slower and clearer pace.',
    nextButtonLabel: 'Next step',
    nextButtonDisabled: false,
  },
  step_2_natural: {
    label: 'Step 2 of 3',
    title: 'Natural pace response',
    instruction: 'Repeat the same text again, now at a calm and natural speaking pace.',
    nextButtonLabel: 'Next step',
    nextButtonDisabled: false,
  },
  step_3_retell_ready: {
    label: 'Step 3 of 3',
    title: 'Retell from memory',
    instruction: 'Put the text aside and retell the main idea in your own words.',
    nextButtonLabel: 'All steps complete',
    nextButtonDisabled: true,
  },
} as const;

type RootLike = ParentNode & {
  querySelector<E extends Element = Element>(selector: string): E | null;
};

interface ShellElements {
  setupScreen: HTMLElement;
  exerciseScreen: HTMLElement;
  settingsPanel: HTMLElement;
  openSettingsButton: HTMLButtonElement;
  closeSettingsButton: HTMLButtonElement;
  statusMessage: HTMLElement;
  settingsStatus: HTMLElement;
  clearApiKeyButton: HTMLButtonElement;
  apiKeyInput: HTMLInputElement;
  textLanguageInput: HTMLInputElement;
  analysisLanguageInput: HTMLInputElement;
  sameLanguageToggle: HTMLInputElement;
  topicInput: HTMLInputElement;
  reuseTopicButton: HTMLButtonElement;
  generateButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  nextStepButton: HTMLButtonElement;
  stepLabel: HTMLElement;
  stepTitle: HTMLElement;
  stepInstruction: HTMLElement;
  exerciseText: HTMLElement;
}

function getRequiredElement<E extends Element>(root: RootLike, selector: string): E {
  const element = root.querySelector<E>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function collectShellElements(root: RootLike): ShellElements {
  return {
    setupScreen: getRequiredElement(root, '[data-screen="setup"]'),
    exerciseScreen: getRequiredElement(root, '[data-screen="exercise"]'),
    settingsPanel: getRequiredElement(root, '[data-settings-panel]'),
    openSettingsButton: getRequiredElement(root, '[data-open-settings-button]'),
    closeSettingsButton: getRequiredElement(root, '[data-close-settings-button]'),
    statusMessage: getRequiredElement(root, '[data-status-message]'),
    settingsStatus: getRequiredElement(root, '[data-settings-status]'),
    clearApiKeyButton: getRequiredElement(root, '[data-clear-api-key-button]'),
    apiKeyInput: getRequiredElement(root, '[data-api-key-input]'),
    textLanguageInput: getRequiredElement(root, '[data-text-language-input]'),
    analysisLanguageInput: getRequiredElement(root, '[data-analysis-language-input]'),
    sameLanguageToggle: getRequiredElement(root, '[data-same-language-toggle]'),
    topicInput: getRequiredElement(root, '[data-topic-input]'),
    reuseTopicButton: getRequiredElement(root, '[data-reuse-topic-button]'),
    generateButton: getRequiredElement(root, '[data-generate-button]'),
    resetButton: getRequiredElement(root, '[data-reset-button]'),
    nextStepButton: getRequiredElement(root, '[data-next-step-button]'),
    stepLabel: getRequiredElement(root, '[data-step-label]'),
    stepTitle: getRequiredElement(root, '[data-step-title]'),
    stepInstruction: getRequiredElement(root, '[data-step-instruction]'),
    exerciseText: getRequiredElement(root, '[data-exercise-text]'),
  };
}

function getSettingsStatus(config: PublicConfig): string {
  if (config.gemini.has_api_key) {
    if (config.gemini.api_key_source === 'env') {
      return 'API key status: available from environment variables.';
    }

    return 'API key status: stored locally.';
  }

  return 'API key status: not stored locally.';
}

function getStatusMessage(model: AppModel, reuseNextGeneration: boolean): string {
  if (model.error_message) {
    return model.error_message;
  }

  if (model.flow === 'generating_text') {
    return GENERATING_STATUS;
  }

  if (reuseNextGeneration) {
    return REUSE_STATUS;
  }

  if (model.generated_exercise) {
    return 'Exercise ready. Follow the current speaking step.';
  }

  return READY_STATUS;
}

function readSettings(elements: ShellElements, reuseLastTopic: boolean): SettingsFormState {
  return syncAnalysisLanguage({
    text_language: elements.textLanguageInput.value.trim(),
    analysis_language: elements.analysisLanguageInput.value.trim(),
    same_language_for_analysis: elements.sameLanguageToggle.checked,
    topic_prompt: elements.topicInput.value.trim(),
    reuse_last_topic: reuseLastTopic,
  });
}

function buildConfigRequest(
  config: PublicConfig,
  settings: SettingsFormState,
  apiKeyValue: string,
): Record<string, unknown> {
  const nextConfig = buildConfigUpdatePayload(config, settings);
  const trimmedApiKey = apiKeyValue.trim();

  return {
    ...nextConfig,
    gemini: {
      model: nextConfig.gemini.model,
      api_key: trimmedApiKey === '' ? null : trimmedApiKey,
    },
    langfuse: {
      host: nextConfig.langfuse.host,
      public_key: null,
      secret_key: null,
    },
  };
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${url}`);
  }

  return (await response.json()) as T;
}

function render(
  elements: ShellElements,
  model: AppModel,
  isSettingsOpen: boolean,
  reuseNextGeneration: boolean,
): void {
  elements.textLanguageInput.value = model.settings.text_language;
  elements.analysisLanguageInput.value = model.settings.analysis_language;
  elements.sameLanguageToggle.checked = model.settings.same_language_for_analysis;
  elements.topicInput.value = model.settings.topic_prompt;
  elements.settingsStatus.textContent = getSettingsStatus(model.config);
  elements.statusMessage.textContent = getStatusMessage(model, reuseNextGeneration);
  elements.settingsPanel.hidden = !isSettingsOpen;

  const generatedExercise = model.generated_exercise;
  const hasExercise = generatedExercise !== null;
  elements.setupScreen.hidden = hasExercise;
  elements.exerciseScreen.hidden = !hasExercise;
  elements.generateButton.disabled = model.flow === 'generating_text';
  elements.reuseTopicButton.disabled = model.flow === 'generating_text';

  if (!hasExercise) {
    elements.stepLabel.textContent = STEP_CONTENT.step_1_slow.label;
    elements.stepTitle.textContent = STEP_CONTENT.step_1_slow.title;
    elements.stepInstruction.textContent = STEP_CONTENT.step_1_slow.instruction;
    elements.nextStepButton.textContent = STEP_CONTENT.step_1_slow.nextButtonLabel;
    elements.nextStepButton.disabled = STEP_CONTENT.step_1_slow.nextButtonDisabled;
    elements.exerciseText.textContent = EXERCISE_PLACEHOLDER;
    return;
  }

  const stepContent = STEP_CONTENT[model.flow as keyof typeof STEP_CONTENT] ?? STEP_CONTENT.step_1_slow;
  elements.stepLabel.textContent = stepContent.label;
  elements.stepTitle.textContent = stepContent.title;
  elements.stepInstruction.textContent = stepContent.instruction;
  elements.nextStepButton.textContent = stepContent.nextButtonLabel;
  elements.nextStepButton.disabled = stepContent.nextButtonDisabled;
  elements.exerciseText.textContent = generatedExercise.text;
}

export async function startApp(
  documentRef: Document = document,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const root = documentRef.querySelector('[data-app-root]') as RootLike | null;
  if (!root) {
    return;
  }

  const elements = collectShellElements(root);
  let model = createInitialAppModel();
  let isSettingsOpen = false;
  let reuseNextGeneration = false;

  const updateSettings = (nextSettings: SettingsFormState): void => {
    model = {
      ...model,
      settings: nextSettings,
    };
    render(elements, model, isSettingsOpen, reuseNextGeneration);
  };

  const refreshFromInputs = (): void => {
    updateSettings(readSettings(elements, reuseNextGeneration));
  };

  elements.openSettingsButton.addEventListener('click', () => {
    isSettingsOpen = true;
    render(elements, model, isSettingsOpen, reuseNextGeneration);
  });

  elements.closeSettingsButton.addEventListener('click', () => {
    isSettingsOpen = false;
    render(elements, model, isSettingsOpen, reuseNextGeneration);
  });

  elements.textLanguageInput.addEventListener('input', () => {
    refreshFromInputs();
  });

  elements.analysisLanguageInput.addEventListener('input', () => {
    refreshFromInputs();
  });

  elements.sameLanguageToggle.addEventListener('change', () => {
    refreshFromInputs();
  });

  elements.topicInput.addEventListener('input', () => {
    refreshFromInputs();
  });

  elements.reuseTopicButton.addEventListener('click', () => {
    reuseNextGeneration = true;
    refreshFromInputs();
  });

  elements.nextStepButton.addEventListener('click', () => {
    model = advanceExerciseStep(model);
    render(elements, model, isSettingsOpen, reuseNextGeneration);
  });

  elements.resetButton.addEventListener('click', () => {
    reuseNextGeneration = false;
    const resetModel = createInitialAppModel();
    model = applyLoadedConfig(resetModel, model.config);
    render(elements, model, isSettingsOpen, reuseNextGeneration);
  });

  elements.clearApiKeyButton.addEventListener('click', async () => {
    try {
      const config = await requestJson<PublicConfig>(fetchImpl, '/api/config/api-key', {
        method: 'DELETE',
      });
      model = applyLoadedConfig(model, config);
      model = {
        ...model,
        error_message: null,
      };
      elements.apiKeyInput.value = '';
      render(elements, model, isSettingsOpen, reuseNextGeneration);
    } catch {
      elements.settingsStatus.textContent = CLEAR_ERROR_STATUS;
    }
  });

  elements.generateButton.addEventListener('click', async () => {
    const settings = readSettings(elements, reuseNextGeneration);
    model = {
      ...model,
      settings,
    };
    model = startGeneration(model);
    render(elements, model, isSettingsOpen, reuseNextGeneration);

    try {
      const savedConfig = await requestJson<PublicConfig>(fetchImpl, '/api/config', {
        method: 'POST',
        body: JSON.stringify(
          buildConfigRequest(model.config, settings, elements.apiKeyInput.value),
        ),
      });
      model = applyLoadedConfig(model, savedConfig);

      const exercise = await requestJson<GeneratedExercise>(fetchImpl, '/api/generate-text', {
        method: 'POST',
        body: JSON.stringify(buildGenerateRequest(settings)),
      });
      reuseNextGeneration = false;
      model = applyGeneratedExercise(model, exercise);
    } catch {
      reuseNextGeneration = false;
      model = applyGenerationError(model, GENERATE_ERROR_STATUS);
    }

    render(elements, model, isSettingsOpen, reuseNextGeneration);
  });

  model = {
    ...model,
    error_message: LOADING_STATUS,
  };
  render(elements, model, isSettingsOpen, reuseNextGeneration);

  try {
    const config = await requestJson<PublicConfig>(fetchImpl, '/api/config', {
      method: 'GET',
    });
    model = applyLoadedConfig(model, config);
    model = {
      ...model,
      error_message: null,
    };
  } catch {
    model = applyGenerationError(model, LOAD_ERROR_STATUS);
    model = {
      ...model,
      flow: 'home',
    };
  }

  render(elements, model, isSettingsOpen, reuseNextGeneration);
}

if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
  void startApp();
}
