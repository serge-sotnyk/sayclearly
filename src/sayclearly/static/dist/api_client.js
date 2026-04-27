const ENDPOINTS = {
    config: '/api/config',
    apiKey: '/api/config/api-key',
    generate: '/api/generate-text',
    analyze: '/api/analyze-recording',
    history: '/api/history',
    historyById: (id) => `/api/history/${encodeURIComponent(id)}`,
};
export class RequestError extends Error {
    detail;
    constructor(message, detail = null) {
        super(message);
        this.name = 'RequestError';
        this.detail = detail;
    }
}
export function getRequestErrorMessage(error, fallback) {
    return error instanceof RequestError && error.detail !== null ? error.detail : fallback;
}
export function getRequestErrorMessageWithDetail(error, fallback) {
    if (!(error instanceof RequestError) || error.detail === null || error.detail === '') {
        return fallback;
    }
    // Provider-side errors are tagged "Gemini: ..." in the backend service layer.
    // Wrap them with the friendly fallback so the user sees both context and cause.
    // Other 4xx details (auth, config) are already complete sentences and replace the fallback.
    if (error.detail.startsWith('Gemini:')) {
        return `${fallback} (${error.detail})`;
    }
    return error.detail;
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
export async function fetchConfig(fetchImpl, signal) {
    return await requestJson(fetchImpl, ENDPOINTS.config, {
        method: 'GET',
        signal,
    });
}
export async function saveConfig(fetchImpl, payload, signal) {
    return await requestJson(fetchImpl, ENDPOINTS.config, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
    });
}
export async function deleteApiKey(fetchImpl) {
    return await requestJson(fetchImpl, ENDPOINTS.apiKey, {
        method: 'DELETE',
    });
}
export async function generateExercise(fetchImpl, payload, signal) {
    return await requestJson(fetchImpl, ENDPOINTS.generate, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
    });
}
export async function analyzeRecording(fetchImpl, formData, signal) {
    return await requestJson(fetchImpl, ENDPOINTS.analyze, {
        method: 'POST',
        body: formData,
        signal,
    });
}
export async function loadHistory(fetchImpl) {
    return await requestJson(fetchImpl, ENDPOINTS.history, { method: 'GET' });
}
export async function loadHistorySession(fetchImpl, sessionId) {
    return await requestJson(fetchImpl, ENDPOINTS.historyById(sessionId), {
        method: 'GET',
    });
}
export async function saveHistorySession(fetchImpl, session) {
    return await requestJson(fetchImpl, ENDPOINTS.history, {
        method: 'POST',
        body: JSON.stringify(session),
    });
}
export async function clearHistory(fetchImpl) {
    return await requestJson(fetchImpl, ENDPOINTS.history, {
        method: 'DELETE',
    });
}
