import type { components } from './api_types.js';

type Schemas = components['schemas'];

export type FlowState =
  | 'home'
  | 'generating_text'
  | 'step_1_slow'
  | 'step_2_natural'
  | 'step_3_retell_ready'
  | 'requesting_microphone'
  | 'recording'
  | 'recorded'
  | 'analyzing'
  | 'review'
  | 'history'
  | 'error';

type ThinkingLevel = Schemas['GeminiPublicConfig']['text_thinking_level'];

export const LANGUAGES: readonly string[] = [
  'English',
  'Ukrainian',
  'Russian',
  'German',
  'French',
  'Spanish',
  'Portuguese',
  'Italian',
  'Polish',
  'Dutch',
  'Czech',
  'Turkish',
  'Japanese',
  'Chinese (Simplified)',
  'Korean',
  'Hindi',
  'Arabic',
  'Hebrew',
  'Vietnamese',
  'Indonesian',
];

const FALLBACK_GEMINI_MODELS: GeminiModelCatalogEntry[] = [
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    free_tier_requests_per_day_hint: null,
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash-Lite Preview',
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
];

type GeminiModelCatalogEntry = Schemas['GeminiModelCatalogEntry'];

export type PublicConfig = Schemas['PublicConfigView'];

export interface SettingsFormState {
  text_language: string;
  analysis_language: string;
  same_language_for_analysis: boolean;
  text_model: string;
  analysis_model: string;
  same_model_for_analysis: boolean;
  text_thinking_level: ThinkingLevel;
  topic_prompt: string;
}

export interface RecentTopicEntry {
  topic: string;
  text_language: string;
  analysis_language: string;
}

export interface InitialPageData {
  recent_topics: RecentTopicEntry[];
  initial_topic: string | null;
}

export type GeneratedExercise = Schemas['ExerciseGenerationResponse'];
export type RecordingReview = Schemas['RecordingReview'];
export type Hesitation = Schemas['Hesitation'];
export type SessionAnalysis = Schemas['SessionAnalysis'];
export type HistorySession = Schemas['HistorySession'];
export type HistoryStore = Schemas['HistoryStore'];
export type RecordingAnalysisResult = Schemas['RecordingAnalysisResult'];

type HistoryOrigin = 'review' | 'home' | null;

export type GenerateRequest = Schemas['ExerciseGenerationRequest'];

export type ConfigUpdatePayload = Schemas['ConfigUpdatePayload'];

export interface AppModel {
  flow: FlowState;
  config: PublicConfig;
  settings: SettingsFormState;
  generated_exercise: GeneratedExercise | null;
  has_recording: boolean;
  recording_error: string | null;
  review: RecordingReview | null;
  latest_session: HistorySession | null;
  history_sessions: HistorySession[] | null;
  selected_history_session: HistorySession | null;
  history_error: string | null;
  history_save_error: string | null;
  history_origin: HistoryOrigin;
  error_message: string | null;
}

const DEFAULT_CONFIG: PublicConfig = {
  version: 1,
  text_language: 'English',
  analysis_language: 'English',
  same_language_for_analysis: true,
  ui_language: 'English',
  session_limit: 10,
  keep_last_audio: false,
  gemini: {
    model: 'gemini-3-flash-preview',
    text_model: 'gemini-3-flash-preview',
    analysis_model: 'gemini-3-flash-preview',
    same_model_for_analysis: true,
    text_thinking_level: 'high',
    has_api_key: false,
    api_key_source: 'none',
    available_models: FALLBACK_GEMINI_MODELS,
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
  return syncSettings({
    text_language: config.text_language,
    analysis_language: config.analysis_language,
    same_language_for_analysis: config.same_language_for_analysis,
    text_model: config.gemini.text_model,
    analysis_model: config.gemini.analysis_model,
    same_model_for_analysis: config.gemini.same_model_for_analysis,
    text_thinking_level: config.gemini.text_thinking_level,
    topic_prompt: '',
  });
}

export function createInitialAppModel(): AppModel {
  return {
    flow: 'home',
    config: DEFAULT_CONFIG,
    settings: buildSettingsFromConfig(DEFAULT_CONFIG),
    generated_exercise: null,
    has_recording: false,
    recording_error: null,
    review: null,
    latest_session: null,
    history_sessions: null,
    selected_history_session: null,
    history_error: null,
    history_save_error: null,
    history_origin: null,
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

export function syncAnalysisModel(settings: SettingsFormState): SettingsFormState {
  if (!settings.same_model_for_analysis) {
    return { ...settings };
  }

  return {
    ...settings,
    analysis_model: settings.text_model,
  };
}

function syncSettings(settings: SettingsFormState): SettingsFormState {
  return syncAnalysisModel(syncAnalysisLanguage(settings));
}

export function applyLoadedConfig(model: AppModel, config: PublicConfig): AppModel {
  return {
    ...model,
    config,
    settings: buildSettingsFromConfig(config),
  };
}

export function buildGenerateRequest(settings: SettingsFormState): GenerateRequest {
  const syncedSettings = syncSettings(settings);

  return {
    language: syncedSettings.text_language,
    analysis_language: syncedSettings.analysis_language,
    topic_prompt: syncedSettings.topic_prompt,
  };
}

export function buildConfigUpdatePayload(
  config: PublicConfig,
  settings: SettingsFormState,
): ConfigUpdatePayload {
  const syncedSettings = syncSettings(settings);

  return {
    text_language: syncedSettings.text_language,
    analysis_language: syncedSettings.analysis_language,
    same_language_for_analysis: syncedSettings.same_language_for_analysis,
    ui_language: config.ui_language,
    session_limit: config.session_limit,
    keep_last_audio: config.keep_last_audio,
    gemini: {
      text_model: syncedSettings.text_model,
      analysis_model: syncedSettings.analysis_model,
      same_model_for_analysis: syncedSettings.same_model_for_analysis,
      text_thinking_level: syncedSettings.text_thinking_level,
      api_key: null,
    },
    langfuse: {
      host: config.langfuse.host,
      public_key: null,
      secret_key: null,
    },
  };
}

export function startGeneration(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'generating_text',
    settings: syncSettings(model.settings),
    generated_exercise: null,
    latest_session: null,
    history_save_error: null,
    error_message: null,
  };
}

export function applyGeneratedExercise(model: AppModel, exercise: GeneratedExercise): AppModel {
  return {
    ...model,
    flow: 'step_1_slow',
    generated_exercise: exercise,
    has_recording: false,
    recording_error: null,
    review: null,
    latest_session: null,
    history_save_error: null,
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

export function startRecordingRequest(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'requesting_microphone',
    has_recording: false,
    recording_error: null,
    review: null,
  };
}

export function markRecordingStarted(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'recording',
    recording_error: null,
  };
}

export function storeRecordedAudio(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'recorded',
    has_recording: true,
    recording_error: null,
  };
}

export function applyRecordingError(model: AppModel, message: string): AppModel {
  return {
    ...model,
    flow: 'step_3_retell_ready',
    has_recording: false,
    recording_error: message,
    review: null,
  };
}

export function startRecordingAnalysis(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'analyzing',
    recording_error: null,
    review: null,
  };
}

export function applyAnalysisResult(
  model: AppModel,
  result: RecordingAnalysisResult,
  session: HistorySession,
): AppModel {
  return {
    ...model,
    flow: 'review',
    has_recording: true,
    recording_error: null,
    review: result.review,
    latest_session: session,
    history_save_error: null,
  };
}

export function applyAnalysisError(model: AppModel, message: string): AppModel {
  return {
    ...model,
    flow: 'recorded',
    has_recording: true,
    recording_error: message,
    review: null,
  };
}

export function applyHistorySaveError(model: AppModel, message: string): AppModel {
  return {
    ...model,
    history_save_error: message,
  };
}

export function enterHistory(model: AppModel, origin: HistoryOrigin): AppModel {
  return {
    ...model,
    flow: 'history',
    history_origin: origin,
    history_sessions: null,
    selected_history_session: null,
    history_error: null,
  };
}

export function applyHistoryLoaded(model: AppModel, history: HistoryStore): AppModel {
  return {
    ...model,
    history_sessions: history.sessions ?? [],
    selected_history_session: history.sessions?.[0] ?? null,
    history_error: null,
  };
}

export function applyHistoryDetails(model: AppModel, session: HistorySession): AppModel {
  return {
    ...model,
    selected_history_session: session,
    history_error: null,
  };
}

export function applyHistoryError(model: AppModel, message: string): AppModel {
  return {
    ...model,
    history_error: message,
  };
}

export function returnFromHistory(model: AppModel): AppModel {
  return {
    ...model,
    flow: model.history_origin === 'review' && model.review !== null ? 'review' : 'home',
    history_origin: null,
  };
}

export function startNewSession(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'home',
    generated_exercise: null,
    has_recording: false,
    recording_error: null,
    review: null,
    latest_session: null,
    selected_history_session: null,
    history_error: null,
    history_save_error: null,
    history_origin: null,
    error_message: null,
  };
}

export function reuseTopic(model: AppModel, topicPrompt: string): AppModel {
  return {
    ...startNewSession(model),
    settings: {
      ...model.settings,
      topic_prompt: topicPrompt,
    },
  };
}

export function dedupeRecentTopics(entries: RecentTopicEntry[]): RecentTopicEntry[] {
  const seen = new Set<string>();
  const result: RecentTopicEntry[] = [];

  for (const entry of entries) {
    const topic = entry.topic.trim();
    if (!topic) {
      continue;
    }
    const key = topic.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ ...entry, topic });
  }

  return result;
}

export function pushRecentTopic(
  entries: RecentTopicEntry[],
  next: RecentTopicEntry,
  limit?: number,
): RecentTopicEntry[] {
  const merged = dedupeRecentTopics([next, ...entries]);
  return limit !== undefined && limit > 0 ? merged.slice(0, limit) : merged;
}

export function findRecentTopicMatch(
  entries: RecentTopicEntry[],
  topicValue: string,
): RecentTopicEntry | null {
  const normalized = topicValue.trim().toLocaleLowerCase();
  if (!normalized) {
    return null;
  }
  for (const entry of entries) {
    if (entry.topic.trim().toLocaleLowerCase() === normalized) {
      return entry;
    }
  }
  return null;
}

export function filterRecentTopics(
  entries: RecentTopicEntry[],
  query: string,
): RecentTopicEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return [];
  }
  return entries.filter((entry) =>
    entry.topic.toLocaleLowerCase().includes(normalized),
  );
}

export function resetRecording(model: AppModel): AppModel {
  return {
    ...model,
    flow: 'step_3_retell_ready',
    has_recording: false,
    recording_error: null,
    review: null,
  };
}
