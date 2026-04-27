import {
  type ConfigUpdatePayload,
  type GeneratedExercise,
  type GenerateRequest,
  type HistorySession,
  type HistoryStore,
  type PublicConfig,
  type RecordingAnalysisResult,
} from './app_state.js';

const ENDPOINTS = {
  config: '/api/config',
  apiKey: '/api/config/api-key',
  generate: '/api/generate-text',
  analyze: '/api/analyze-recording',
  history: '/api/history',
  historyById: (id: string): string => `/api/history/${encodeURIComponent(id)}`,
} as const;

export class RequestError extends Error {
  detail: string | null;

  constructor(message: string, detail: string | null = null) {
    super(message);
    this.name = 'RequestError';
    this.detail = detail;
  }
}

export function getRequestErrorMessage(error: unknown, fallback: string): string {
  return error instanceof RequestError && error.detail !== null ? error.detail : fallback;
}

export function getRequestErrorMessageWithDetail(error: unknown, fallback: string): string {
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

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  options?: RequestInit,
): Promise<T> {
  const headers =
    options?.body instanceof FormData
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
    let detail: string | null = null;

    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === 'string' && body.detail.trim() !== '') {
        detail = body.detail;
      }
    } catch {
      detail = null;
    }

    throw new RequestError(`Request failed: ${url}`, detail);
  }

  return (await response.json()) as T;
}

export async function fetchConfig(
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<PublicConfig> {
  return await requestJson<PublicConfig>(fetchImpl, ENDPOINTS.config, {
    method: 'GET',
    signal,
  });
}

export async function saveConfig(
  fetchImpl: typeof fetch,
  payload: ConfigUpdatePayload,
  signal?: AbortSignal,
): Promise<PublicConfig> {
  return await requestJson<PublicConfig>(fetchImpl, ENDPOINTS.config, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export async function deleteApiKey(fetchImpl: typeof fetch): Promise<PublicConfig> {
  return await requestJson<PublicConfig>(fetchImpl, ENDPOINTS.apiKey, {
    method: 'DELETE',
  });
}

export async function generateExercise(
  fetchImpl: typeof fetch,
  payload: GenerateRequest,
  signal?: AbortSignal,
): Promise<GeneratedExercise> {
  return await requestJson<GeneratedExercise>(fetchImpl, ENDPOINTS.generate, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export async function analyzeRecording(
  fetchImpl: typeof fetch,
  formData: FormData,
  signal?: AbortSignal,
): Promise<RecordingAnalysisResult> {
  return await requestJson<RecordingAnalysisResult>(fetchImpl, ENDPOINTS.analyze, {
    method: 'POST',
    body: formData,
    signal,
  });
}

export async function loadHistory(fetchImpl: typeof fetch): Promise<HistoryStore> {
  return await requestJson<HistoryStore>(fetchImpl, ENDPOINTS.history, { method: 'GET' });
}

export async function loadHistorySession(
  fetchImpl: typeof fetch,
  sessionId: string,
): Promise<HistorySession> {
  return await requestJson<HistorySession>(fetchImpl, ENDPOINTS.historyById(sessionId), {
    method: 'GET',
  });
}

export async function saveHistorySession(
  fetchImpl: typeof fetch,
  session: HistorySession,
): Promise<HistoryStore> {
  return await requestJson<HistoryStore>(fetchImpl, ENDPOINTS.history, {
    method: 'POST',
    body: JSON.stringify(session),
  });
}
