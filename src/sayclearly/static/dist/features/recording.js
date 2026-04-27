import { analyzeRecording, getRequestErrorMessageWithDetail, saveHistorySession, } from '../api_client.js';
import { applyAnalysisError, applyAnalysisResult, applyHistoryLoaded, applyHistorySaveError, applyRecordingError, markRecordingStarted, pushRecentTopic, resetRecording, startRecordingAnalysis, startRecordingRequest, storeRecordedAudio, } from '../app_state.js';
import { stopStream, } from '../app_context.js';
const ANALYZE_ERROR_STATUS = 'Could not analyze the recording. Try again.';
const RECORDING_WARN_AFTER_SECONDS = 300;
const RECORDING_WARNING_SUFFIX = ' Long recordings may not analyze well.';
function formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
        analysis_language: exercise.analysis_language,
        topic_prompt: exercise.topic_prompt === '' ? null : exercise.topic_prompt,
        text: exercise.text,
        analysis,
    };
}
export function createRecordingFeature(ctx) {
    const { elements, recordingApi, fetchImpl, state } = ctx;
    const stopActiveStream = () => {
        stopStream(state.activeStream);
        state.activeStream = null;
    };
    const stopRecordingTicker = () => {
        if (state.recordingTickerId !== null) {
            clearInterval(state.recordingTickerId);
            state.recordingTickerId = null;
        }
        state.recordingStartedAt = null;
        elements.recordingTimer.textContent = '';
    };
    const clearArtifacts = () => {
        state.activeRecorderToken += 1;
        state.activeRecorder = null;
        stopActiveStream();
        stopRecordingTicker();
        state.recordedBlob = null;
        if (state.recordedUrl !== null) {
            recordingApi.revokeObjectURL(state.recordedUrl);
            state.recordedUrl = null;
        }
    };
    const handleStartRecording = async () => {
        if (!recordingApi.isSupported()) {
            state.model = applyRecordingError(state.model, 'This browser does not support microphone recording.');
            ctx.rerender();
            return;
        }
        state.model = startRecordingRequest(state.model);
        ctx.rerender();
        const recorderToken = state.activeRecorderToken + 1;
        state.activeRecorderToken = recorderToken;
        try {
            const stream = await recordingApi.getUserMedia();
            if (recorderToken !== state.activeRecorderToken) {
                stopStream(stream);
                return;
            }
            state.activeStream = stream;
            const recorder = recordingApi.createMediaRecorder(stream);
            const chunks = [];
            state.activeRecorder = recorder;
            recorder.addEventListener('dataavailable', (event) => {
                if (recorderToken !== state.activeRecorderToken) {
                    return;
                }
                if (event.data) {
                    chunks.push(event.data);
                }
            });
            recorder.addEventListener('stop', () => {
                if (recorderToken !== state.activeRecorderToken) {
                    return;
                }
                state.activeRecorder = null;
                stopActiveStream();
                const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
                if (blob.size === 0) {
                    clearArtifacts();
                    state.model = applyRecordingError(state.model, 'No recording was captured. Please try again.');
                    ctx.rerender();
                    return;
                }
                if (state.recordedUrl !== null) {
                    recordingApi.revokeObjectURL(state.recordedUrl);
                }
                state.recordedBlob = blob;
                state.recordedUrl = recordingApi.createObjectURL(blob);
                state.model = storeRecordedAudio(state.model);
                ctx.rerender();
            });
            recorder.start();
            state.model = markRecordingStarted(state.model);
            state.recordingStartedAt = Date.now();
            elements.recordingTimer.textContent = formatDuration(0);
            const tickRecording = () => {
                if (state.recordingStartedAt === null) {
                    return;
                }
                const elapsed = Math.floor((Date.now() - state.recordingStartedAt) / 1000);
                elements.recordingTimer.textContent = formatDuration(elapsed);
                if (elapsed >= RECORDING_WARN_AFTER_SECONDS) {
                    const baseText = 'Recording in progress. Stop when your retelling is complete.';
                    elements.recordingStatusText.textContent = baseText + RECORDING_WARNING_SUFFIX;
                }
            };
            state.recordingTickerId = setInterval(tickRecording, 1000);
        }
        catch {
            if (recorderToken !== state.activeRecorderToken) {
                return;
            }
            state.activeRecorder = null;
            stopActiveStream();
            stopRecordingTicker();
            state.model = applyRecordingError(state.model, 'Microphone access was unavailable. Please try again.');
            ctx.closeStep3Details();
        }
        ctx.rerender();
    };
    const handleStopRecording = () => {
        stopRecordingTicker();
        state.activeRecorder?.stop();
    };
    const handleAnalyzeRecording = async () => {
        if (state.recordedBlob === null) {
            state.model = applyRecordingError(state.model, 'No recording was captured. Please try again.');
            ctx.rerender();
            return;
        }
        state.model = startRecordingAnalysis(state.model);
        const controller = new AbortController();
        state.activeAbortController = controller;
        ctx.rerender();
        try {
            const formData = new FormData();
            formData.append('audio', state.recordedBlob, 'retelling.webm');
            if (state.model.generated_exercise) {
                const metadata = JSON.stringify({
                    language: state.model.generated_exercise.language,
                    analysis_language: state.model.generated_exercise.analysis_language,
                    exercise_text: state.model.generated_exercise.text,
                });
                formData.append('metadata', metadata);
            }
            const result = await analyzeRecording(fetchImpl, formData, controller.signal);
            const latestSession = buildHistorySession(state.model.generated_exercise, result.analysis);
            state.model = applyAnalysisResult(state.model, result, latestSession);
            try {
                const history = await saveHistorySession(fetchImpl, latestSession);
                state.model = applyHistoryLoaded(state.model, history);
                const newTopic = latestSession.topic_prompt?.trim();
                if (newTopic) {
                    state.recentTopics = pushRecentTopic(state.recentTopics, {
                        topic: newTopic,
                        text_language: latestSession.language,
                        analysis_language: latestSession.analysis_language ?? latestSession.language,
                    });
                }
            }
            catch {
                state.model = applyHistorySaveError(state.model, 'Review is ready, but this session was not saved to history.');
            }
        }
        catch (error) {
            if (controller.signal.aborted) {
                state.model = storeRecordedAudio(state.model);
            }
            else {
                state.model = applyAnalysisError(state.model, getRequestErrorMessageWithDetail(error, ANALYZE_ERROR_STATUS));
            }
        }
        finally {
            if (state.activeAbortController === controller) {
                state.activeAbortController = null;
            }
        }
        ctx.rerender();
    };
    const handleCancelAnalyze = () => {
        state.activeAbortController?.abort();
    };
    const handleRecordAgain = () => {
        clearArtifacts();
        state.model = resetRecording(state.model);
        ctx.closeStep3Details();
        ctx.rerender();
    };
    const attachHandlers = () => {
        elements.startRecordingButton.addEventListener('click', handleStartRecording);
        elements.stopRecordingButton.addEventListener('click', handleStopRecording);
        elements.analyzeRecordingButton.addEventListener('click', handleAnalyzeRecording);
        elements.cancelAnalyzeButton.addEventListener('click', handleCancelAnalyze);
        elements.recordAgainButton.addEventListener('click', handleRecordAgain);
    };
    return { attachHandlers, clearArtifacts };
}
