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
function buildSettingsFromConfig(config) {
    return syncAnalysisLanguage({
        text_language: config.text_language,
        analysis_language: config.analysis_language,
        same_language_for_analysis: config.same_language_for_analysis,
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
export function applyLoadedConfig(model, config) {
    return {
        ...model,
        config,
        settings: buildSettingsFromConfig(config),
    };
}
export function buildGenerateRequest(settings) {
    const syncedSettings = syncAnalysisLanguage(settings);
    return {
        language: syncedSettings.text_language,
        analysis_language: syncedSettings.analysis_language,
        topic_prompt: syncedSettings.topic_prompt,
        reuse_last_topic: syncedSettings.reuse_last_topic,
    };
}
export function buildConfigUpdatePayload(config, settings) {
    const syncedSettings = syncAnalysisLanguage(settings);
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
            model: config.gemini.model,
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
        settings: syncAnalysisLanguage(model.settings),
        generated_exercise: null,
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
export function applyAnalysisResult(model, review) {
    return {
        ...model,
        flow: 'review',
        has_recording: true,
        recording_error: null,
        review,
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
export function resetRecording(model) {
    return {
        ...model,
        flow: 'step_3_retell_ready',
        has_recording: false,
        recording_error: null,
        review: null,
    };
}
