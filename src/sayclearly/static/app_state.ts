export type FlowState =
  | 'home'
  | 'generating_text'
  | 'step_1_slow'
  | 'step_2_natural'
  | 'step_3_retell_ready'
  | 'error';

type ConfigSource = 'env' | 'stored' | 'none';

interface GeminiPublicConfig {
  model: string;
  has_api_key: boolean;
  api_key_source: ConfigSource;
}

interface LangfusePublicConfig {
  host: string | null;
  enabled: boolean;
  has_public_key: boolean;
  has_secret_key: boolean;
  public_key_source: ConfigSource;
  secret_key_source: ConfigSource;
}

export interface PublicConfig {
  version: number;
  text_language: string;
  analysis_language: string;
  same_language_for_analysis: boolean;
  ui_language: string;
  last_topic_prompt: string;
  session_limit: number;
  keep_last_audio: boolean;
  gemini: GeminiPublicConfig;
  langfuse: LangfusePublicConfig;
}

export interface SettingsFormState {
  text_language: string;
  analysis_language: string;
  same_language_for_analysis: boolean;
  topic_prompt: string;
  reuse_last_topic: boolean;
}

export interface GeneratedExercise {
  text_language: string;
  analysis_language: string;
  topic_prompt: string;
  text: string;
}

interface GenerateRequest {
  text_language: string;
  analysis_language: string;
  topic_prompt: string;
  reuse_last_topic: boolean;
}

export interface AppModel {
  flow: FlowState;
  config: PublicConfig;
  settings: SettingsFormState;
  generated_exercise: GeneratedExercise | null;
  error_message: string | null;
}

const DEFAULT_CONFIG: PublicConfig = {
  version: 1,
  text_language: 'uk',
  analysis_language: 'uk',
  same_language_for_analysis: true,
  ui_language: 'uk',
  last_topic_prompt: '',
  session_limit: 10,
  keep_last_audio: false,
  gemini: {
    model: 'gemini-2.5-flash',
    has_api_key: false,
    api_key_source: 'none',
  },
  langfuse: {
    host: null,
    enabled: false,
    has_public_key: false,
    has_secret_key: false,
    public_key_source: 'none',
    secret_key_source: 'none',
  },
};

function buildSettingsFromConfig(config: PublicConfig): SettingsFormState {
  return syncAnalysisLanguage({
    text_language: config.text_language,
    analysis_language: config.analysis_language,
    same_language_for_analysis: config.same_language_for_analysis,
    topic_prompt: config.last_topic_prompt,
    reuse_last_topic: false,
  });
}

export function createInitialAppModel(): AppModel {
  return {
    flow: 'home',
    config: DEFAULT_CONFIG,
    settings: buildSettingsFromConfig(DEFAULT_CONFIG),
    generated_exercise: null,
    error_message: null,
  };
}

export function syncAnalysisLanguage(settings: SettingsFormState): SettingsFormState {
  if (!settings.same_language_for_analysis) {
    return { ...settings };
  }

  return {
    ...settings,
    analysis_language: settings.text_language,
  };
}

export function applyLoadedConfig(model: AppModel, config: PublicConfig): AppModel {
  return {
    ...model,
    config,
    settings: buildSettingsFromConfig(config),
  };
}

export function buildGenerateRequest(settings: SettingsFormState): GenerateRequest {
  const syncedSettings = syncAnalysisLanguage(settings);

  return {
    text_language: syncedSettings.text_language,
    analysis_language: syncedSettings.analysis_language,
    topic_prompt: syncedSettings.topic_prompt,
    reuse_last_topic: syncedSettings.reuse_last_topic,
  };
}

export function buildConfigUpdatePayload(
  config: PublicConfig,
  settings: SettingsFormState,
): PublicConfig {
  const syncedSettings = syncAnalysisLanguage(settings);
  const lastTopicPrompt =
    syncedSettings.reuse_last_topic && syncedSettings.topic_prompt === ''
      ? config.last_topic_prompt
      : syncedSettings.topic_prompt;

  return {
    ...config,
    text_language: syncedSettings.text_language,
    analysis_language: syncedSettings.analysis_language,
    same_language_for_analysis: syncedSettings.same_language_for_analysis,
    last_topic_prompt: lastTopicPrompt,
  };
}

export function startGeneration(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'generating_text',
    settings: syncAnalysisLanguage(model.settings),
    generated_exercise: null,
    error_message: null,
  };
}

export function applyGeneratedExercise(model: AppModel, exercise: GeneratedExercise): AppModel {
  return {
    ...model,
    flow: 'step_1_slow',
    generated_exercise: exercise,
    error_message: null,
  };
}

export function applyGenerationError(model: AppModel, message: string): AppModel {
  return {
    ...model,
    flow: 'error',
    error_message: message,
  };
}

export function advanceExerciseStep(model: AppModel): AppModel {
  switch (model.flow) {
    case 'step_1_slow':
      return { ...model, flow: 'step_2_natural' };
    case 'step_2_natural':
      return { ...model, flow: 'step_3_retell_ready' };
    default:
      return model;
  }
}
