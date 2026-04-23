const FALLBACK_GEMINI_MODELS = [
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
const DEFAULT_CONFIG = {
    version: 1,
    text_language: 'uk',
    analysis_language: 'uk',
    same_language_for_analysis: true,
    ui_language: 'uk',
    last_topic_prompt: '',
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
function buildSettingsFromConfig(config) {
    return syncSettings({
        text_language: config.text_language,
        analysis_language: config.analysis_language,
        same_language_for_analysis: config.same_language_for_analysis,
        text_model: config.gemini.text_model,
        analysis_model: config.gemini.analysis_model,
        same_model_for_analysis: config.gemini.same_model_for_analysis,
        text_thinking_level: config.gemini.text_thinking_level,
        topic_prompt: config.last_topic_prompt,
        reuse_last_topic: false,
    });
}
export function createInitialAppModel() {
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
export function syncAnalysisLanguage(settings) {
    if (!settings.same_language_for_analysis) {
        return { ...settings };
    }
    return {
        ...settings,
        analysis_language: settings.text_language,
    };
}
export function syncAnalysisModel(settings) {
    if (!settings.same_model_for_analysis) {
        return { ...settings };
    }
    return {
        ...settings,
        analysis_model: settings.text_model,
    };
}
function syncSettings(settings) {
    return syncAnalysisModel(syncAnalysisLanguage(settings));
}
export function applyLoadedConfig(model, config) {
    return {
        ...model,
        config,
        settings: buildSettingsFromConfig(config),
    };
}
export function buildGenerateRequest(settings) {
    const syncedSettings = syncSettings(settings);
    return {
        language: syncedSettings.text_language,
        analysis_language: syncedSettings.analysis_language,
        topic_prompt: syncedSettings.topic_prompt,
        reuse_last_topic: syncedSettings.reuse_last_topic,
    };
}
export function buildConfigUpdatePayload(config, settings) {
    const syncedSettings = syncSettings(settings);
    const lastTopicPrompt = syncedSettings.reuse_last_topic && syncedSettings.topic_prompt === ''
        ? config.last_topic_prompt
        : syncedSettings.topic_prompt;
    return {
        text_language: syncedSettings.text_language,
        analysis_language: syncedSettings.analysis_language,
        same_language_for_analysis: syncedSettings.same_language_for_analysis,
        ui_language: config.ui_language,
        last_topic_prompt: lastTopicPrompt,
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
export function startGeneration(model) {
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
export function applyGeneratedExercise(model, exercise) {
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
export function applyGenerationError(model, message) {
    return {
        ...model,
        flow: 'error',
        error_message: message,
    };
}
export function advanceExerciseStep(model) {
    switch (model.flow) {
        case 'step_1_slow':
            return { ...model, flow: 'step_2_natural' };
        case 'step_2_natural':
            return { ...model, flow: 'step_3_retell_ready' };
        default:
            return model;
    }
}
export function startRecordingRequest(model) {
    return {
        ...model,
        flow: 'requesting_microphone',
        has_recording: false,
        recording_error: null,
        review: null,
    };
}
export function markRecordingStarted(model) {
    return {
        ...model,
        flow: 'recording',
        recording_error: null,
    };
}
export function storeRecordedAudio(model) {
    return {
        ...model,
        flow: 'recorded',
        has_recording: true,
        recording_error: null,
    };
}
export function applyRecordingError(model, message) {
    return {
        ...model,
        flow: 'step_3_retell_ready',
        has_recording: false,
        recording_error: message,
        review: null,
    };
}
export function startRecordingAnalysis(model) {
    return {
        ...model,
        flow: 'analyzing',
        recording_error: null,
        review: null,
    };
}
export function applyAnalysisResult(model, result, session) {
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
export function applyAnalysisError(model, message) {
    return {
        ...model,
        flow: 'recorded',
        has_recording: true,
        recording_error: message,
        review: null,
    };
}
export function applyHistorySaveError(model, message) {
    return {
        ...model,
        history_save_error: message,
    };
}
export function enterHistory(model, origin) {
    return {
        ...model,
        flow: 'history',
        history_origin: origin,
        history_sessions: null,
        selected_history_session: null,
        history_error: null,
    };
}
export function applyHistoryLoaded(model, history) {
    return {
        ...model,
        history_sessions: history.sessions,
        selected_history_session: history.sessions[0] ?? null,
        history_error: null,
    };
}
export function applyHistoryDetails(model, session) {
    return {
        ...model,
        selected_history_session: session,
        history_error: null,
    };
}
export function applyHistoryError(model, message) {
    return {
        ...model,
        history_error: message,
    };
}
export function returnFromHistory(model) {
    return {
        ...model,
        flow: model.history_origin === 'review' && model.review !== null ? 'review' : 'home',
        history_origin: null,
    };
}
export function startNewSession(model) {
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
export function reuseTopic(model, topicPrompt) {
    return {
        ...startNewSession(model),
        settings: {
            ...model.settings,
            topic_prompt: topicPrompt,
            reuse_last_topic: false,
        },
    };
}
export function resetRecording(model) {
    return {
        ...model,
        flow: 'step_3_retell_ready',
        has_recording: false,
        recording_error: null,
        review: null,
    };
}
