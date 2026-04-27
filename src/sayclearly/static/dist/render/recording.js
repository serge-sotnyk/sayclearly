export function renderRecording(elements, model, recordedUrl, showRecordingControls) {
    elements.recordingControls.hidden = !showRecordingControls;
    elements.startRecordingButton.hidden = model.flow !== 'step_3_retell_ready';
    elements.stopRecordingButton.hidden = model.flow !== 'recording';
    elements.analyzeRecordingButton.hidden = model.flow !== 'recorded';
    elements.cancelAnalyzeButton.hidden = model.flow !== 'analyzing';
    elements.recordAgainButton.hidden = !['recorded', 'review'].includes(model.flow);
    elements.recordingPreview.hidden = recordedUrl === null;
    elements.recordingPreview.src = recordedUrl ?? '';
    if (model.recording_error) {
        elements.recordingStatusText.textContent = model.recording_error;
    }
    else {
        switch (model.flow) {
            case 'requesting_microphone':
                elements.recordingStatusText.textContent = 'Requesting microphone access...';
                break;
            case 'recording':
                elements.recordingStatusText.textContent =
                    'Recording in progress. Stop when your retelling is complete.';
                break;
            case 'recorded':
                elements.recordingStatusText.textContent =
                    'Recording ready. Listen back or upload it for feedback.';
                break;
            case 'analyzing':
                elements.recordingStatusText.textContent = 'Uploading your recording for feedback...';
                break;
            case 'review':
                elements.recordingStatusText.textContent =
                    'Review ready. Record again when you want another attempt.';
                break;
            default:
                elements.recordingStatusText.textContent = 'Record your retelling when you are ready.';
                break;
        }
    }
    elements.recordingTimer.hidden = model.flow !== 'recording';
    if (model.flow !== 'recording') {
        elements.recordingTimer.textContent = '';
    }
}
