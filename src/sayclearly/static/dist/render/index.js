import { renderExercise } from './exercise.js';
import { renderHistory } from './history.js';
import { renderRecording } from './recording.js';
import { renderReview } from './review.js';
import { renderSetup } from './setup.js';
export { GENERATING_STATUS, READY_STATUS } from './setup.js';
const STEP_3_LIKE_FLOWS = [
    'step_3_retell_ready',
    'requesting_microphone',
    'recording',
    'recorded',
    'analyzing',
    'review',
];
export function render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, historyCallbacks) {
    renderSetup(documentRef, elements, model, isSettingsOpen, transientBannerMessage);
    const hasExercise = model.generated_exercise !== null;
    const showRecordingControls = hasExercise && STEP_3_LIKE_FLOWS.includes(model.flow);
    const isGenerating = model.flow === 'generating_text';
    elements.historyScreen.hidden = model.flow !== 'history';
    elements.setupScreen.hidden = hasExercise || model.flow === 'history';
    elements.exerciseScreen.hidden = !hasExercise || model.flow === 'history';
    elements.generateButton.disabled = isGenerating;
    elements.historyButton.disabled = isGenerating;
    elements.generateSpinner.hidden = !isGenerating;
    elements.generateLabel.textContent = isGenerating ? 'Generating...' : 'Generate';
    elements.cancelGenerateButton.hidden = !isGenerating;
    renderRecording(elements, model, recordedUrl, showRecordingControls);
    renderReview(elements, model);
    renderHistory(documentRef, elements, model, historyCallbacks);
    renderExercise(elements, model, hasExercise, showRecordingControls);
}
