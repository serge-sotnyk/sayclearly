import { type AppModel, type RecentTopicEntry } from './app_state.js';
import { type ShellElements } from './dom_elements.js';

export interface RecorderLike {
  addEventListener(
    type: 'dataavailable' | 'stop',
    listener: (event: { data?: Blob }) => void,
  ): void;
  start(): void;
  stop(): void;
}

export interface RecordingApi {
  isSupported(): boolean;
  getUserMedia(): Promise<unknown>;
  createMediaRecorder(stream: unknown): RecorderLike;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface StreamLike {
  getTracks(): Array<{ stop(): void }>;
}

export interface MutableAppState {
  model: AppModel;
  isSettingsOpen: boolean;
  isHistoryModalOpen: boolean;
  hasLoadedConfig: boolean;
  recentTopics: RecentTopicEntry[];
  transientBannerMessage: string | null;
  transientBannerTimeout: ReturnType<typeof setTimeout> | null;
  activeRecorder: RecorderLike | null;
  activeStream: StreamLike | null;
  activeRecorderToken: number;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
  activeAbortController: AbortController | null;
  generationStartedAt: number | null;
  generationTickerId: ReturnType<typeof setInterval> | null;
  recordingStartedAt: number | null;
  recordingTickerId: ReturnType<typeof setInterval> | null;
}

export interface AppContext {
  documentRef: Document;
  elements: ShellElements;
  recordingApi: RecordingApi;
  fetchImpl: typeof fetch;
  state: MutableAppState;
  rerender(): void;
  closeStep3Details(): void;
  clearRecordingArtifacts(): void;
  setTransientBanner(message: string): void;
}

export function createDefaultRecordingApi(): RecordingApi {
  return {
    isSupported() {
      return (
        typeof navigator !== 'undefined' &&
        typeof navigator.mediaDevices?.getUserMedia === 'function' &&
        typeof MediaRecorder !== 'undefined'
      );
    },
    async getUserMedia() {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    },
    createMediaRecorder(stream) {
      return new MediaRecorder(stream as MediaStream);
    },
    createObjectURL(blob) {
      return URL.createObjectURL(blob);
    },
    revokeObjectURL(url) {
      URL.revokeObjectURL(url);
    },
  };
}

export function stopStream(stream: StreamLike | null): void {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}
