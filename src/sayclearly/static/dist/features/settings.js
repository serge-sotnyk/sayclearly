import { clearHistory, deleteApiKey, loadHistory, saveConfig } from '../api_client.js';
import { applyLoadedConfig, buildConfigUpdatePayload, createInitialAppModel, syncAnalysisLanguage, syncAnalysisModel, } from '../app_state.js';
const CLEAR_KEY_ERROR_STATUS = 'Could not clear the stored API key. Try again.';
const CLEAR_HISTORY_ERROR_STATUS = 'Could not clear history. Try again.';
const SAVE_ERROR_STATUS = 'Could not save settings. Try again.';
const HISTORY_COUNT_ERROR_STATUS = 'Could not check the current history size. Try again.';
const CLEAR_KEY_CONFIRM = 'Clear the stored Gemini API key on this machine?';
const CLEAR_HISTORY_CONFIRM = 'Permanently delete all saved sessions from local history?';
export function readSettings(elements) {
    return syncAnalysisModel(syncAnalysisLanguage({
        text_language: elements.textLanguageInput.value.trim(),
        analysis_language: elements.analysisLanguageInput.value.trim(),
        same_language_for_analysis: elements.sameLanguageToggle.checked,
        text_model: elements.textModelSelect.value,
        analysis_model: elements.analysisModelSelect.value,
        same_model_for_analysis: elements.sameModelToggle.checked,
        text_thinking_level: elements.thinkingLevelSelect
            .value,
        topic_prompt: elements.topicInput.value,
    }));
}
export function createSettingsFeature(ctx) {
    const { documentRef, elements, fetchImpl, state } = ctx;
    const updateSettings = (nextSettings) => {
        state.model = {
            ...state.model,
            settings: nextSettings,
        };
        ctx.rerender();
    };
    const refreshFromInputs = () => {
        updateSettings(readSettings(elements));
    };
    const openModal = () => {
        state.isSettingsOpen = true;
        elements.apiKeyInput.value = '';
        elements.sessionLimitInput.value = String(state.model.config.session_limit);
        documentRef.body?.classList.add('is-modal-open');
        ctx.rerender();
    };
    const closeModal = () => {
        if (!state.isSettingsOpen) {
            return;
        }
        state.isSettingsOpen = false;
        documentRef.body?.classList.remove('is-modal-open');
        ctx.rerender();
    };
    const handleClearApiKey = async () => {
        if (!confirmAction(CLEAR_KEY_CONFIRM)) {
            return;
        }
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
        }
        catch {
            elements.settingsStatus.textContent = CLEAR_KEY_ERROR_STATUS;
        }
    };
    const handleClearHistory = async () => {
        if (!confirmAction(CLEAR_HISTORY_CONFIRM)) {
            return;
        }
        try {
            await clearHistory(fetchImpl);
            state.recentTopics = [];
            state.model = {
                ...state.model,
                history_sessions: state.model.history_sessions === null ? null : [],
                selected_history_session: null,
                history_error: null,
            };
            ctx.rerender();
        }
        catch {
            elements.settingsStatus.textContent = CLEAR_HISTORY_ERROR_STATUS;
        }
    };
    const buildSavePayload = (newSessionLimit, apiKey) => {
        const base = buildConfigUpdatePayload(state.model.config, state.model.settings);
        const trimmedApiKey = apiKey.trim();
        return {
            ...base,
            session_limit: newSessionLimit,
            gemini: {
                ...base.gemini,
                api_key: trimmedApiKey === '' ? null : trimmedApiKey,
            },
        };
    };
    const handleSave = async () => {
        const rawLimit = elements.sessionLimitInput.value.trim();
        const parsedLimit = Number(rawLimit);
        if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
            elements.settingsStatus.textContent =
                'Session limit must be a positive whole number.';
            return;
        }
        const previousLimit = state.model.config.session_limit;
        if (parsedLimit < previousLimit) {
            let currentCount;
            try {
                const history = await loadHistory(fetchImpl);
                currentCount = history.sessions?.length ?? 0;
            }
            catch {
                elements.settingsStatus.textContent = HISTORY_COUNT_ERROR_STATUS;
                return;
            }
            if (currentCount > parsedLimit) {
                const removed = currentCount - parsedLimit;
                const message = removed === 1
                    ? 'This will permanently delete 1 saved session. Continue?'
                    : `This will permanently delete ${removed} saved sessions. Continue?`;
                if (!confirmAction(message)) {
                    return;
                }
            }
        }
        try {
            const config = await saveConfig(fetchImpl, buildSavePayload(parsedLimit, elements.apiKeyInput.value));
            state.hasLoadedConfig = true;
            state.model = applyLoadedConfig(state.model, config);
            elements.apiKeyInput.value = '';
            closeModal();
        }
        catch {
            elements.settingsStatus.textContent = SAVE_ERROR_STATUS;
        }
    };
    const handleReset = () => {
        ctx.clearRecordingArtifacts();
        const resetModel = createInitialAppModel();
        state.model = applyLoadedConfig(resetModel, state.model.config);
        ctx.rerender();
    };
    const confirmAction = (message) => {
        const win = (documentRef.defaultView ?? null);
        if (win && typeof win.confirm === 'function') {
            return win.confirm(message);
        }
        if (typeof confirm === 'function') {
            return confirm(message);
        }
        return true;
    };
    const attachHandlers = () => {
        elements.openSettingsButton.addEventListener('click', openModal);
        for (const button of elements.closeSettingsButtons) {
            button.addEventListener('click', closeModal);
        }
        elements.settingsModalCloseButton.addEventListener('click', closeModal);
        elements.settingsModalBackdrop.addEventListener('click', closeModal);
        for (const input of [
            elements.textLanguageInput,
            elements.analysisLanguageInput,
        ]) {
            input.addEventListener('input', refreshFromInputs);
        }
        for (const select of [
            elements.textModelSelect,
            elements.analysisModelSelect,
            elements.thinkingLevelSelect,
        ]) {
            select.addEventListener('change', refreshFromInputs);
        }
        for (const toggle of [
            elements.sameModelToggle,
            elements.sameLanguageToggle,
        ]) {
            toggle.addEventListener('change', refreshFromInputs);
        }
        elements.topicInput.addEventListener('input', refreshFromInputs);
        elements.clearApiKeyButton.addEventListener('click', handleClearApiKey);
        elements.clearHistoryButton.addEventListener('click', handleClearHistory);
        elements.saveSettingsButton.addEventListener('click', handleSave);
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
            const target = event.target;
            if (target && elements.apiKeyPopover.contains(target)) {
                return;
            }
            elements.apiKeyPopover.classList.remove('is-open');
            elements.apiKeyPopoverToggle.setAttribute('aria-expanded', 'false');
        });
        documentRef.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }
            if (state.isSettingsOpen) {
                closeModal();
            }
        });
    };
    return { attachHandlers, openModal, closeModal };
}
