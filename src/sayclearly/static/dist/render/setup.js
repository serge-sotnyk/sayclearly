export const READY_STATUS = 'Ready to generate a guided exercise.';
export const GENERATING_STATUS = 'Generating your guided exercise...';
function formatModelLabel(model) {
    if (model.free_tier_requests_per_day_hint === null) {
        return model.label;
    }
    return `${model.label} (${model.free_tier_requests_per_day_hint} RPD)`;
}
function renderModelOptions(documentRef, select, models) {
    const options = models.map((model) => {
        const option = documentRef.createElement('option');
        option.value = model.id;
        option.textContent = formatModelLabel(model);
        return option;
    });
    select.replaceChildren(...options);
}
function getSettingsStatus(config) {
    if (config.gemini.has_api_key) {
        if (config.gemini.api_key_source === 'env') {
            return 'API key status: available from environment variables.';
        }
        return 'API key status: stored locally.';
    }
    return 'API key status: not stored locally.';
}
function getApiKeyHint(config) {
    if (config.gemini.api_key_source === 'env') {
        return 'Using the Gemini API key from .env for this session.';
    }
    if (config.gemini.has_api_key) {
        return 'A Gemini API key is stored locally. Paste a new key to replace it.';
    }
    return 'Paste a key here or use .env for local development.';
}
function getApiKeyPlaceholder(config) {
    if (config.gemini.api_key_source === 'env') {
        return 'Using API key from environment';
    }
    if (config.gemini.has_api_key) {
        return 'Stored locally. Paste a new key to replace it';
    }
    return 'Paste your local API key';
}
function getLocalStorageNote(config) {
    if (config.gemini.api_key_source === 'env') {
        return 'Runs fully locally on your machine. Bring your own Gemini API key. The current key comes from environment variables for this session.';
    }
    if (config.gemini.has_api_key) {
        return 'Runs fully locally on your machine. Bring your own Gemini API key. The current key is stored only in your local config on this computer.';
    }
    return 'Runs fully locally on your machine. Bring your own Gemini API key. Add it here or through .env for this session.';
}
function getTelemetryNote(config) {
    if (config.langfuse.enabled) {
        return 'Optional telemetry is active because Langfuse is configured in this environment.';
    }
    return 'Optional telemetry stays off unless Langfuse is configured.';
}
export function getStatusMessage(model, transientBannerMessage) {
    if (model.error_message) {
        return model.error_message;
    }
    if (model.flow === 'generating_text') {
        return GENERATING_STATUS;
    }
    if (transientBannerMessage) {
        return transientBannerMessage;
    }
    if (model.generated_exercise) {
        return 'Exercise ready. Follow the current speaking step.';
    }
    return READY_STATUS;
}
export function renderSetup(documentRef, elements, model, isSettingsOpen, transientBannerMessage) {
    renderModelOptions(documentRef, elements.textModelSelect, model.config.gemini.available_models);
    renderModelOptions(documentRef, elements.analysisModelSelect, model.config.gemini.available_models);
    elements.textModelSelect.value = model.settings.text_model;
    elements.analysisModelSelect.value = model.settings.analysis_model;
    elements.sameModelToggle.checked = model.settings.same_model_for_analysis;
    elements.thinkingLevelSelect.value = model.settings.text_thinking_level;
    elements.analysisModelSelect.disabled = model.settings.same_model_for_analysis;
    elements.textLanguageInput.value = model.settings.text_language;
    elements.analysisLanguageInput.value = model.settings.analysis_language;
    elements.sameLanguageToggle.checked = model.settings.same_language_for_analysis;
    elements.topicInput.value = model.settings.topic_prompt;
    elements.settingsStatus.textContent = getSettingsStatus(model.config);
    elements.apiKeyHint.textContent = getApiKeyHint(model.config);
    elements.apiKeyInput.placeholder = getApiKeyPlaceholder(model.config);
    elements.localStorageNote.textContent = getLocalStorageNote(model.config);
    elements.telemetryNote.textContent = getTelemetryNote(model.config);
    elements.statusMessage.textContent = getStatusMessage(model, transientBannerMessage);
    elements.settingsModal.hidden = !isSettingsOpen;
}
