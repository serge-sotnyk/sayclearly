export function createDefaultRecordingApi() {
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
export function stopStream(stream) {
    for (const track of stream?.getTracks() ?? []) {
        track.stop();
    }
}
