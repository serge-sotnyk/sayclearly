import { advanceExerciseStep, applyAnalysisError, applyAnalysisResult, applyGeneratedExercise, applyGenerationError, applyLoadedConfig, applyRecordingError, buildConfigUpdatePayload, buildGenerateRequest, createInitialAppModel, markRecordingStarted, resetRecording, startRecordingAnalysis, startRecordingRequest, startGeneration, storeRecordedAudio, syncAnalysisModel, syncAnalysisLanguage, } from './app_state.js';
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
        title: 'Warm-up response',
        instruction: 'Read the prompt out loud once, then repeat it with a slower and clearer pace.',
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
        settingsPanel: getRequiredElement(root, '[data-settings-panel]'),
        openSettingsButton: getRequiredElement(root, '[data-open-settings-button]'),
        closeSettingsButton: getRequiredElement(root, '[data-close-settings-button]'),
        statusMessage: getRequiredElement(root, '[data-status-message]'),
        settingsStatus: getRequiredElement(root, '[data-settings-status]'),
        clearApiKeyButton: getRequiredElement(root, '[data-clear-api-key-button]'),
        apiKeyInput: getRequiredElement(root, '[data-api-key-input]'),
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
function render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl) {
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
    elements.setupScreen.hidden = hasExercise;
    elements.exerciseScreen.hidden = !hasExercise;
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
    elements.reviewSummary.textContent = model.review?.summary ?? '';
    elements.reviewClarity.textContent = model.review?.clarity ?? '';
    elements.reviewPace.textContent = model.review?.pace ?? '';
    elements.reviewHesitations.textContent = model.review?.hesitations.join('\n') ?? '';
    elements.reviewRecommendations.textContent = model.review?.recommendations.join('\n') ?? '';
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
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    };
    const refreshFromInputs = () => {
        updateSettings(readSettings(elements, reuseNextGeneration));
    };
    elements.openSettingsButton.addEventListener('click', () => {
        isSettingsOpen = true;
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    });
    elements.closeSettingsButton.addEventListener('click', () => {
        isSettingsOpen = false;
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
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
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    });
    elements.startRecordingButton.addEventListener('click', async () => {
        if (!recordingApi.isSupported()) {
            model = applyRecordingError(model, 'This browser does not support microphone recording.');
            render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
            return;
        }
        model = startRecordingRequest(model);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
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
                    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
                    return;
                }
                if (recordedUrl !== null) {
                    recordingApi.revokeObjectURL(recordedUrl);
                }
                recordedBlob = blob;
                recordedUrl = recordingApi.createObjectURL(blob);
                model = storeRecordedAudio(model);
                render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
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
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    });
    elements.stopRecordingButton.addEventListener('click', () => {
        activeRecorder?.stop();
    });
    elements.analyzeRecordingButton.addEventListener('click', async () => {
        if (recordedBlob === null) {
            model = applyRecordingError(model, 'No recording was captured. Please try again.');
            render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
            return;
        }
        model = startRecordingAnalysis(model);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
        try {
            const formData = new FormData();
            formData.append('audio', recordedBlob, 'retelling.webm');
            const review = await requestJson(fetchImpl, '/api/analyze-recording', {
                method: 'POST',
                body: formData,
            });
            model = applyAnalysisResult(model, review);
        }
        catch {
            model = applyAnalysisError(model, 'Could not upload the recording. Try again.');
        }
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    });
    elements.recordAgainButton.addEventListener('click', () => {
        clearRecordingArtifacts();
        model = resetRecording(model);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    });
    elements.resetButton.addEventListener('click', () => {
        reuseNextGeneration = false;
        clearRecordingArtifacts();
        const resetModel = createInitialAppModel();
        model = applyLoadedConfig(resetModel, model.config);
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
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
            render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
        }
        catch {
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
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
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
        render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
    });
    model = {
        ...model,
        error_message: LOADING_STATUS,
    };
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
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
    render(documentRef, elements, model, isSettingsOpen, reuseNextGeneration, recordedUrl);
}
if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
    void startApp();
}
