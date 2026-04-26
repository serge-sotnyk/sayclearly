import { advanceExerciseStep, applyAnalysisError, applyAnalysisResult, applyGeneratedExercise, applyGenerationError, applyHistoryDetails, applyHistoryError, applyHistoryLoaded, applyHistorySaveError, applyLoadedConfig, applyRecordingError, buildConfigUpdatePayload, buildGenerateRequest, createInitialAppModel, enterHistory, markRecordingStarted, resetRecording, returnFromHistory, reuseTopic, startNewSession, startRecordingAnalysis, startRecordingRequest, startGeneration, storeRecordedAudio, syncAnalysisModel, syncAnalysisLanguage, } from './app_state.js';
const READY_STATUS = 'Ready to generate a guided exercise.';
const LOADING_STATUS = 'Loading your saved settings...';
const GENERATING_STATUS = 'Generating your guided exercise...';
const LOAD_ERROR_STATUS = 'Could not load your saved settings. You can still enter them manually.';
const GENERATE_ERROR_STATUS = 'Could not generate a guided exercise. Check your settings and try again.';
const CLEAR_ERROR_STATUS = 'Could not clear the stored API key. Try again.';
const REUSE_STATUS = 'The next generation will reuse your last saved topic.';
const EXERCISE_PLACEHOLDER = 'Your generated exercise text will appear here when the frontend bundle is connected.';
const STEP_CONTENT = {
    step_1_slow: {
        label: 'Step 1 of 3',
        title: 'Slow, exaggerated reading',
        instruction: 'Read the text very slowly and over-articulate every consonant and word ending.',
        nextButtonLabel: 'Next step',
        nextButtonDisabled: false,
    },
    step_2_natural: {
        label: 'Step 2 of 3',
        title: 'Closer to natural pace',
        instruction: 'Read the same text again — closer to normal speech, but still a bit slower and clearer than usual.',
        nextButtonLabel: 'Next step',
        nextButtonDisabled: false,
    },
    step_3_retell_ready: {
        label: 'Step 3 of 3',
        title: 'Retell and record',
        instruction: 'Look away from the text and retell it in your own words, keeping the calm-and-clear style of step 2.',
        nextButtonLabel: 'All steps complete',
        nextButtonDisabled: true,
    },
};
class RequestError extends Error {
    detail;
    constructor(message, detail = null) {
        super(message);
        this.name = 'RequestError';
        this.detail = detail;
    }
}
function createDefaultRecordingApi() {
    return {
        isSupported() {
            return (typeof navigator !== 'undefined' &&
                typeof navigator.mediaDevices?.getUserMedia === 'function' &&
                typeof MediaRecorder !== 'undefined');
        },
        async getUserMedia() {
            return await navigator.mediaDevices.getUserMedia({ audio: true });
        },
        createMediaRecorder(stream) {
            return new MediaRecorder(stream);
        },
        createObjectURL(blob) {
            return URL.createObjectURL(blob);
        },
        revokeObjectURL(url) {
            URL.revokeObjectURL(url);
        },
    };
}
function getRequiredElement(root, selector) {
    const element = root.querySelector(selector);
    if (!element) {
        throw new Error(`Missing required element: ${selector}`);
    }
    return element;
}
function collectShellElements(root) {
    return {
        setupScreen: getRequiredElement(root, '[data-screen="setup"]'),
        exerciseScreen: getRequiredElement(root, '[data-screen="exercise"]'),
        reviewActions: getRequiredElement(root, '[data-review-actions]'),
        settingsPanel: getRequiredElement(root, '[data-settings-panel]'),
        openSettingsButton: getRequiredElement(root, '[data-open-settings-button]'),
        closeSettingsButton: getRequiredElement(root, '[data-close-settings-button]'),
        statusMessage: getRequiredElement(root, '[data-status-message]'),
        settingsStatus: getRequiredElement(root, '[data-settings-status]'),
        clearApiKeyButton: getRequiredElement(root, '[data-clear-api-key-button]'),
        apiKeyInput: getRequiredElement(root, '[data-api-key-input]'),
        apiKeyHint: getRequiredElement(root, '[data-api-key-hint]'),
        textModelSelect: getRequiredElement(root, '[data-text-model-select]'),
        analysisModelSelect: getRequiredElement(root, '[data-analysis-model-select]'),
        sameModelToggle: getRequiredElement(root, '[data-same-model-toggle]'),
        thinkingLevelSelect: getRequiredElement(root, '[data-thinking-level-select]'),
        textLanguageInput: getRequiredElement(root, '[data-text-language-input]'),
        analysisLanguageInput: getRequiredElement(root, '[data-analysis-language-input]'),
        sameLanguageToggle: getRequiredElement(root, '[data-same-language-toggle]'),
        topicInput: getRequiredElement(root, '[data-topic-input]'),
        reuseTopicButton: getRequiredElement(root, '[data-reuse-topic-button]'),
        generateButton: getRequiredElement(root, '[data-generate-button]'),
        resetButton: getRequiredElement(root, '[data-reset-button]'),
        nextStepButton: getRequiredElement(root, '[data-next-step-button]'),
        recordingControls: getRequiredElement(root, '[data-recording-controls]'),
        recordingStatus: getRequiredElement(root, '[data-recording-status]'),
        startRecordingButton: getRequiredElement(root, '[data-start-recording-button]'),
        stopRecordingButton: getRequiredElement(root, '[data-stop-recording-button]'),
        analyzeRecordingButton: getRequiredElement(root, '[data-analyze-recording-button]'),
        recordAgainButton: getRequiredElement(root, '[data-record-again-button]'),
        recordingPreview: getRequiredElement(root, '[data-recording-preview]'),
        reviewPanel: getRequiredElement(root, '[data-review-panel]'),
        reviewSummary: getRequiredElement(root, '[data-review-summary]'),
        reviewClarity: getRequiredElement(root, '[data-review-clarity]'),
        reviewPace: getRequiredElement(root, '[data-review-pace]'),
        reviewHesitations: getRequiredElement(root, '[data-review-hesitations]'),
        reviewRecommendations: getRequiredElement(root, '[data-review-recommendations]'),
        stepLabel: getRequiredElement(root, '[data-step-label]'),
        stepTitle: getRequiredElement(root, '[data-step-title]'),
        stepInstruction: getRequiredElement(root, '[data-step-instruction]'),
        exerciseText: getRequiredElement(root, '[data-exercise-text]'),
        historyScreen: getRequiredElement(root, '[data-screen="history"]'),
        newSessionButtons: Array.from(root.querySelectorAll('[data-new-session-button]')),
        reviewReuseTopicButton: getRequiredElement(root, '[data-review-reuse-topic-button]'),
        openHistoryButton: getRequiredElement(root, '[data-open-history-button]'),
        historyList: getRequiredElement(root, '[data-history-list]'),
        historyEmptyState: getRequiredElement(root, '[data-history-empty-state]'),
        historyError: getRequiredElement(root, '[data-history-error]'),
        historySaveError: getRequiredElement(root, '[data-history-save-error]'),
        historyRetryButton: getRequiredElement(root, '[data-history-retry-button]'),
        historyBackButton: getRequiredElement(root, '[data-history-back-button]'),
        historyDetails: getRequiredElement(root, '[data-history-details]'),
        historyDetailSummary: getRequiredElement(root, '[data-history-detail-summary]'),
        historyDetailMeta: getRequiredElement(root, '[data-history-detail-meta]'),
        historyDetailText: getRequiredElement(root, '[data-history-detail-text]'),
        historyDetailClarity: getRequiredElement(root, '[data-history-detail-clarity]'),
        historyDetailPace: getRequiredElement(root, '[data-history-detail-pace]'),
        historyDetailHesitations: getRequiredElement(root, '[data-history-detail-hesitations]'),
        historyDetailReuseTopicButton: getRequiredElement(root, '[data-history-detail-reuse-topic-button]'),
        localStorageNote: getRequiredElement(root, '[data-local-storage-note]'),
        telemetryNote: getRequiredElement(root, '[data-telemetry-note]'),
    };
}
function formatModelLabel(model) {
    if (model.free_tier_requests_per_day_hint === null) {
        return model.label;
    }
    return `${model.label} (${model.free_tier_requests_per_day_hint} RPD hint)`;
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
function getStatusMessage(model, reuseNextGeneration) {
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
function readSettings(elements, reuseLastTopic) {
    return syncAnalysisModel(syncAnalysisLanguage({
        text_language: elements.textLanguageInput.value.trim(),
        analysis_language: elements.analysisLanguageInput.value.trim(),
        same_language_for_analysis: elements.sameLanguageToggle.checked,
        text_model: elements.textModelSelect.value,
        analysis_model: elements.analysisModelSelect.value,
        same_model_for_analysis: elements.sameModelToggle.checked,
        text_thinking_level: elements.thinkingLevelSelect.value,
        topic_prompt: elements.topicInput.value.trim(),
        reuse_last_topic: reuseLastTopic,
    }));
}
function buildConfigRequest(config, settings, apiKeyValue) {
    const nextConfig = buildConfigUpdatePayload(config, settings);
    const trimmedApiKey = apiKeyValue.trim();
    return {
        ...nextConfig,
        gemini: {
            ...nextConfig.gemini,
            api_key: trimmedApiKey === '' ? null : trimmedApiKey,
        },
    };
}
async function requestJson(fetchImpl, url, options) {
    const headers = options?.body instanceof FormData
        ? { ...(options?.headers ?? {}) }
        : {
            'Content-Type': 'application/json',
            ...(options?.headers ?? {}),
        };
    const response = await fetchImpl(url, {
        ...options,
        headers,
    });
    if (!response.ok) {
        let detail = null;
        try {
            const body = (await response.json());
            if (typeof body.detail === 'string' && body.detail.trim() !== '') {
                detail = body.detail;
            }
        }
        catch {
            detail = null;
        }
        throw new RequestError(`Request failed: ${url}`, detail);
    }
    return (await response.json());
}
function getRequestErrorMessage(error, fallback) {
    return error instanceof RequestError && error.detail !== null ? error.detail : fallback;
}
function createClientSessionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function buildHistorySession(exercise, analysis) {
    return {
        id: createClientSessionId(),
        created_at: new Date().toISOString(),
        language: exercise.language,
        topic_prompt: exercise.topic_prompt === '' ? null : exercise.topic_prompt,
        text: exercise.text,
        analysis,
    };
}
async function loadHistory(fetchImpl) {
    return await requestJson(fetchImpl, '/api/history', { method: 'GET' });
}
async function loadHistorySession(fetchImpl, sessionId) {
    return await requestJson(fetchImpl, `/api/history/${sessionId}`, { method: 'GET' });
}
async function saveHistorySession(fetchImpl, session) {
    return await requestJson(fetchImpl, '/api/history', {
        method: 'POST',
        body: JSON.stringify(session),
    });
}
function render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts) {
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
    elements.statusMessage.textContent = getStatusMessage(model, reuseNextGeneration);
    elements.settingsPanel.hidden = !isSettingsOpen;
    const generatedExercise = model.generated_exercise;
    const hasExercise = generatedExercise !== null;
    const showRecordingControls = hasExercise &&
        [
            'step_3_retell_ready',
            'requesting_microphone',
            'recording',
            'recorded',
            'analyzing',
            'review',
        ].includes(model.flow);
    elements.historyScreen.hidden = model.flow !== 'history';
    elements.setupScreen.hidden = hasExercise || model.flow === 'history';
    elements.exerciseScreen.hidden = !hasExercise || model.flow === 'history';
    elements.generateButton.disabled = model.flow === 'generating_text';
    elements.reuseTopicButton.disabled = model.flow === 'generating_text';
    elements.recordingControls.hidden = !showRecordingControls;
    elements.startRecordingButton.hidden = model.flow !== 'step_3_retell_ready';
    elements.stopRecordingButton.hidden = model.flow !== 'recording';
    elements.analyzeRecordingButton.hidden = model.flow !== 'recorded';
    elements.recordAgainButton.hidden = !['recorded', 'review'].includes(model.flow);
    elements.recordingPreview.hidden = recordedUrl === null;
    elements.recordingPreview.src = recordedUrl ?? '';
    elements.reviewPanel.hidden = model.review === null;
    elements.reviewActions.hidden = model.flow !== 'review' || model.review === null;
    elements.reviewSummary.textContent = model.review?.summary ?? '';
    elements.reviewClarity.textContent = model.review?.clarity ?? '';
    elements.reviewPace.textContent = model.review?.pace ?? '';
    elements.reviewHesitations.textContent = model.review?.hesitations.join('\n') ?? '';
    elements.reviewRecommendations.textContent = model.review?.recommendations.join('\n') ?? '';
    elements.historySaveError.hidden = model.history_save_error === null;
    elements.historySaveError.textContent = model.history_save_error ?? '';
    elements.historyError.hidden = model.history_error === null;
    elements.historyError.textContent = model.history_error ?? '';
    const sessions = model.history_sessions ?? [];
    elements.historyEmptyState.hidden = !(model.flow === 'history' && sessions.length === 0 && model.history_error === null);
    const cards = sessions.map((session) => {
        const card = documentRef.createElement('article');
        card.className = 'history-card';
        const summary = documentRef.createElement('p');
        summary.className = 'history-card-copy';
        summary.textContent = session.analysis.summary[0] ?? 'No summary yet.';
        const meta = documentRef.createElement('p');
        meta.className = 'history-card-copy';
        meta.textContent = `${new Date(session.created_at).toLocaleString()} • ${session.language} • ${session.topic_prompt ?? 'No topic'}`;
        const detailsButton = documentRef.createElement('button');
        detailsButton.type = 'button';
        detailsButton.className = 'button button-ghost';
        detailsButton.textContent = 'Open details';
        detailsButton.addEventListener('click', async () => {
            try {
                const detailed = await loadHistorySession(fetchImpl, session.id);
                model = applyHistoryDetails(model, detailed);
            }
            catch {
                model = applyHistoryError(model, 'Could not load session details. Try again.');
            }
            render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
        });
        const reuseButton = documentRef.createElement('button');
        reuseButton.type = 'button';
        reuseButton.className = 'button button-secondary';
        reuseButton.textContent = 'Reuse topic';
        reuseButton.disabled = !session.topic_prompt;
        reuseButton.addEventListener('click', () => {
            if (!session.topic_prompt) {
                return;
            }
            clearRecordingArtifacts();
            model = reuseTopic(model, session.topic_prompt);
            render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
        });
        const actions = documentRef.createElement('div');
        actions.className = 'history-card-actions';
        actions.append(detailsButton, reuseButton);
        card.append(meta, summary, actions);
        return card;
    });
    elements.historyList.replaceChildren(...cards);
    const selected = model.selected_history_session;
    elements.historyDetailSummary.textContent = selected?.analysis.summary.join(' ') ?? 'Select a session to inspect its review details.';
    elements.historyDetailMeta.textContent = selected ? `${selected.language} • ${selected.topic_prompt ?? 'No topic'}` : '';
    elements.historyDetailText.textContent = selected?.text ?? '';
    elements.historyDetailClarity.textContent = selected ? `Clarity score: ${selected.analysis.clarity_score}` : '';
    elements.historyDetailPace.textContent = selected ? `Pace score: ${selected.analysis.pace_score}` : '';
    elements.historyDetailHesitations.textContent = selected
        ? selected.analysis.hesitations.map((h) => `${h.note} (${h.start.toFixed(1)}s-${h.end.toFixed(1)}s)`).join('\n')
        : '';
    elements.historyDetailReuseTopicButton.disabled = !selected?.topic_prompt;
    elements.historyRetryButton.hidden = model.history_error === null;
    if (model.recording_error) {
        elements.recordingStatus.textContent = model.recording_error;
    }
    else {
        switch (model.flow) {
            case 'requesting_microphone':
                elements.recordingStatus.textContent = 'Requesting microphone access...';
                break;
            case 'recording':
                elements.recordingStatus.textContent = 'Recording in progress. Stop when your retelling is complete.';
                break;
            case 'recorded':
                elements.recordingStatus.textContent = 'Recording ready. Listen back or upload it for feedback.';
                break;
            case 'analyzing':
                elements.recordingStatus.textContent = 'Uploading your recording for feedback...';
                break;
            case 'review':
                elements.recordingStatus.textContent = 'Review ready. Record again when you want another attempt.';
                break;
            default:
                elements.recordingStatus.textContent = 'Record your retelling when you are ready.';
                break;
        }
    }
    if (!hasExercise) {
        elements.stepLabel.textContent = STEP_CONTENT.step_1_slow.label;
        elements.stepTitle.textContent = STEP_CONTENT.step_1_slow.title;
        elements.stepInstruction.textContent = STEP_CONTENT.step_1_slow.instruction;
        elements.nextStepButton.textContent = STEP_CONTENT.step_1_slow.nextButtonLabel;
        elements.nextStepButton.disabled = STEP_CONTENT.step_1_slow.nextButtonDisabled;
        elements.nextStepButton.hidden = false;
        elements.exerciseText.textContent = EXERCISE_PLACEHOLDER;
        return;
    }
    const stepContent = STEP_CONTENT[model.flow] ?? STEP_CONTENT.step_1_slow;
    elements.stepLabel.textContent = stepContent.label;
    elements.stepTitle.textContent = stepContent.title;
    elements.stepInstruction.textContent = stepContent.instruction;
    elements.nextStepButton.textContent = stepContent.nextButtonLabel;
    elements.nextStepButton.disabled = stepContent.nextButtonDisabled;
    elements.nextStepButton.hidden = showRecordingControls;
    elements.exerciseText.textContent = generatedExercise.text;
}
export async function startApp(documentRef = document, fetchImpl = fetch, recordingApi = createDefaultRecordingApi()) {
    const root = documentRef.querySelector('[data-app-root]');
    if (!root) {
        return;
    }
    const elements = collectShellElements(root);
    let model = createInitialAppModel();
    let isSettingsOpen = false;
    let reuseNextGeneration = false;
    let hasLoadedConfig = false;
    let activeRecorder = null;
    let activeStream = null;
    let activeRecorderToken = 0;
    let recordedBlob = null;
    let recordedUrl = null;
    const stopStream = (stream) => {
        for (const track of stream?.getTracks() ?? []) {
            track.stop();
        }
    };
    const stopActiveStream = () => {
        stopStream(activeStream);
        activeStream = null;
    };
    const clearRecordingArtifacts = () => {
        activeRecorderToken += 1;
        activeRecorder = null;
        stopActiveStream();
        recordedBlob = null;
        if (recordedUrl !== null) {
            recordingApi.revokeObjectURL(recordedUrl);
            recordedUrl = null;
        }
    };
    const updateSettings = (nextSettings) => {
        model = {
            ...model,
            settings: nextSettings,
        };
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    };
    const refreshFromInputs = () => {
        updateSettings(readSettings(elements, reuseNextGeneration));
    };
    elements.openSettingsButton.addEventListener('click', () => {
        isSettingsOpen = true;
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.closeSettingsButton.addEventListener('click', () => {
        isSettingsOpen = false;
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.textLanguageInput.addEventListener('input', () => {
        refreshFromInputs();
    });
    elements.analysisLanguageInput.addEventListener('input', () => {
        refreshFromInputs();
    });
    elements.textModelSelect.addEventListener('change', () => {
        refreshFromInputs();
    });
    elements.analysisModelSelect.addEventListener('change', () => {
        refreshFromInputs();
    });
    elements.sameModelToggle.addEventListener('change', () => {
        refreshFromInputs();
    });
    elements.thinkingLevelSelect.addEventListener('change', () => {
        refreshFromInputs();
    });
    elements.sameLanguageToggle.addEventListener('change', () => {
        refreshFromInputs();
    });
    elements.topicInput.addEventListener('input', () => {
        if (elements.topicInput.value.trim() !== '') {
            reuseNextGeneration = false;
        }
        refreshFromInputs();
    });
    elements.reuseTopicButton.addEventListener('click', () => {
        reuseNextGeneration = true;
        refreshFromInputs();
    });
    elements.nextStepButton.addEventListener('click', () => {
        model = advanceExerciseStep(model);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.startRecordingButton.addEventListener('click', async () => {
        if (!recordingApi.isSupported()) {
            model = applyRecordingError(model, 'This browser does not support microphone recording.');
            render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
            return;
        }
        model = startRecordingRequest(model);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
        const recorderToken = activeRecorderToken + 1;
        activeRecorderToken = recorderToken;
        try {
            const stream = await recordingApi.getUserMedia();
            if (recorderToken !== activeRecorderToken) {
                stopStream(stream);
                return;
            }
            activeStream = stream;
            const recorder = recordingApi.createMediaRecorder(stream);
            const chunks = [];
            activeRecorder = recorder;
            recorder.addEventListener('dataavailable', (event) => {
                if (recorderToken !== activeRecorderToken) {
                    return;
                }
                if (event.data) {
                    chunks.push(event.data);
                }
            });
            recorder.addEventListener('stop', () => {
                if (recorderToken !== activeRecorderToken) {
                    return;
                }
                activeRecorder = null;
                stopActiveStream();
                const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
                if (blob.size === 0) {
                    clearRecordingArtifacts();
                    model = applyRecordingError(model, 'No recording was captured. Please try again.');
                    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
                    return;
                }
                if (recordedUrl !== null) {
                    recordingApi.revokeObjectURL(recordedUrl);
                }
                recordedBlob = blob;
                recordedUrl = recordingApi.createObjectURL(blob);
                model = storeRecordedAudio(model);
                render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
            });
            recorder.start();
            model = markRecordingStarted(model);
        }
        catch {
            if (recorderToken !== activeRecorderToken) {
                return;
            }
            activeRecorder = null;
            stopActiveStream();
            model = applyRecordingError(model, 'Microphone access was unavailable. Please try again.');
        }
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.stopRecordingButton.addEventListener('click', () => {
        activeRecorder?.stop();
    });
    elements.analyzeRecordingButton.addEventListener('click', async () => {
        if (recordedBlob === null) {
            model = applyRecordingError(model, 'No recording was captured. Please try again.');
            render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
            return;
        }
        model = startRecordingAnalysis(model);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
        try {
            const formData = new FormData();
            formData.append('audio', recordedBlob, 'retelling.webm');
            if (model.generated_exercise) {
                const metadata = JSON.stringify({
                    language: model.generated_exercise.language,
                    analysis_language: model.generated_exercise.analysis_language,
                    exercise_text: model.generated_exercise.text,
                });
                formData.append('metadata', metadata);
            }
            const result = await requestJson(fetchImpl, '/api/analyze-recording', {
                method: 'POST',
                body: formData,
            });
            const latestSession = buildHistorySession(model.generated_exercise, result.analysis);
            model = applyAnalysisResult(model, result, latestSession);
            try {
                const history = await saveHistorySession(fetchImpl, latestSession);
                model = applyHistoryLoaded(model, history);
            }
            catch {
                model = applyHistorySaveError(model, 'Review is ready, but this session was not saved to history.');
            }
        }
        catch {
            model = applyAnalysisError(model, 'Could not upload the recording. Try again.');
        }
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.recordAgainButton.addEventListener('click', () => {
        clearRecordingArtifacts();
        model = resetRecording(model);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.resetButton.addEventListener('click', () => {
        reuseNextGeneration = false;
        clearRecordingArtifacts();
        const resetModel = createInitialAppModel();
        model = applyLoadedConfig(resetModel, model.config);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.clearApiKeyButton.addEventListener('click', async () => {
        try {
            const config = await requestJson(fetchImpl, '/api/config/api-key', {
                method: 'DELETE',
            });
            model = {
                ...model,
                config,
            };
            hasLoadedConfig = true;
            model = {
                ...model,
                error_message: null,
            };
            elements.apiKeyInput.value = '';
            render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
        }
        catch {
            elements.settingsStatus.textContent = CLEAR_ERROR_STATUS;
        }
    });
    for (const button of elements.newSessionButtons) {
        button.addEventListener('click', () => {
            reuseNextGeneration = false;
            clearRecordingArtifacts();
            model = startNewSession(model);
            render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
        });
    }
    elements.reviewReuseTopicButton.addEventListener('click', () => {
        const topicPrompt = model.latest_session?.topic_prompt ?? '';
        if (topicPrompt === '') {
            return;
        }
        clearRecordingArtifacts();
        model = reuseTopic(model, topicPrompt);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.openHistoryButton.addEventListener('click', async () => {
        model = enterHistory(model, model.review !== null ? 'review' : 'home');
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
        try {
            const history = await loadHistory(fetchImpl);
            model = applyHistoryLoaded(model, history);
        }
        catch {
            model = applyHistoryError(model, 'Could not load saved history. Try again.');
        }
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.historyBackButton.addEventListener('click', () => {
        model = returnFromHistory(model);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.historyRetryButton.addEventListener('click', async () => {
        try {
            if (model.history_sessions === null) {
                const history = await loadHistory(fetchImpl);
                model = applyHistoryLoaded(model, history);
            }
            else {
                const selectedId = model.selected_history_session?.id;
                if (!selectedId) {
                    return;
                }
                const session = await loadHistorySession(fetchImpl, selectedId);
                model = applyHistoryDetails(model, session);
            }
        }
        catch {
            model = applyHistoryError(model, model.history_sessions === null
                ? 'Could not load saved history. Try again.'
                : 'Could not load session details. Try again.');
        }
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.historyDetailReuseTopicButton.addEventListener('click', () => {
        const topicPrompt = model.selected_history_session?.topic_prompt ?? '';
        if (topicPrompt === '') {
            return;
        }
        clearRecordingArtifacts();
        model = reuseTopic(model, topicPrompt);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    elements.generateButton.addEventListener('click', async () => {
        const settings = readSettings(elements, reuseNextGeneration);
        model = {
            ...model,
            settings,
        };
        model = startGeneration(model);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
        try {
            let configForSave = model.config;
            if (!hasLoadedConfig) {
                try {
                    configForSave = await requestJson(fetchImpl, '/api/config', {
                        method: 'GET',
                    });
                    model = {
                        ...applyLoadedConfig(model, configForSave),
                        settings,
                    };
                    hasLoadedConfig = true;
                }
                catch (error) {
                    throw new RequestError('Request failed: /api/config', getRequestErrorMessage(error, LOAD_ERROR_STATUS));
                }
            }
            const savedConfig = await requestJson(fetchImpl, '/api/config', {
                method: 'POST',
                body: JSON.stringify(buildConfigRequest(configForSave, settings, elements.apiKeyInput.value)),
            });
            hasLoadedConfig = true;
            model = {
                ...model,
                config: savedConfig,
                settings,
            };
            const exercise = await requestJson(fetchImpl, '/api/generate-text', {
                method: 'POST',
                body: JSON.stringify(buildGenerateRequest(settings)),
            });
            reuseNextGeneration = false;
            model = applyGeneratedExercise(model, exercise);
        }
        catch (error) {
            reuseNextGeneration = false;
            model = applyGenerationError(model, getRequestErrorMessage(error, GENERATE_ERROR_STATUS));
        }
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
    model = {
        ...model,
        error_message: LOADING_STATUS,
    };
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
    try {
        const config = await requestJson(fetchImpl, '/api/config', {
            method: 'GET',
        });
        model = applyLoadedConfig(model, config);
        hasLoadedConfig = true;
        model = {
            ...model,
            error_message: null,
        };
    }
    catch (error) {
        model = applyGenerationError(model, getRequestErrorMessage(error, LOAD_ERROR_STATUS));
        model = {
            ...model,
            flow: 'home',
        };
    }
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl, fetchImpl, clearRecordingArtifacts);
}
if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
    void startApp();
}
