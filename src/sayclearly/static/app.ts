import { fetchConfig, getRequestErrorMessage } from './api_client.js';
import {
  applyGenerationError,
  applyLoadedConfig,
  createInitialAppModel,
  dedupeRecentTopics,
  findRecentTopicMatch,
  type InitialPageData,
  type RecentTopicEntry,
} from './app_state.js';
import {
  type AppContext,
  type MutableAppState,
  type RecordingApi,
  createDefaultRecordingApi,
} from './app_context.js';
import { collectShellElements, type RootLike } from './dom_elements.js';
import { createExerciseFeature } from './features/exercise.js';
import { createHistoryFeature } from './features/history.js';
import { createRecordingFeature } from './features/recording.js';
import { createReviewFeature } from './features/review.js';
import { createSettingsFeature } from './features/settings.js';
import { render } from './render/index.js';

const LOADING_STATUS = 'Loading your saved settings...';
const LOAD_ERROR_STATUS =
  'Could not load your saved settings. You can still enter them manually.';
const TRANSIENT_BANNER_DURATION_MS = 5000;

function readInitialPageData(documentRef: Document): InitialPageData {
  const fallback: InitialPageData = { recent_topics: [], initial_topic: null };
  const node = documentRef.querySelector<HTMLScriptElement>('script[data-recent-topics-payload]');
  if (!node || !node.textContent) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(node.textContent) as unknown;
    if (!Array.isArray(parsed)) {
      return fallback;
    }
    const entries: RecentTopicEntry[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as RecentTopicEntry).topic === 'string' &&
        typeof (item as RecentTopicEntry).text_language === 'string' &&
        typeof (item as RecentTopicEntry).analysis_language === 'string'
      ) {
        entries.push(item as RecentTopicEntry);
      }
    }
    const cleaned = dedupeRecentTopics(entries);
    return {
      recent_topics: cleaned,
      initial_topic: cleaned.length > 0 ? cleaned[0]!.topic : null,
    };
  } catch {
    return fallback;
  }
}

export async function startApp(
  documentRef: Document = document,
  fetchImpl: typeof fetch = fetch,
  recordingApi: RecordingApi = createDefaultRecordingApi(),
): Promise<void> {
  const root = documentRef.querySelector('[data-app-root]') as RootLike | null;
  if (!root) {
    return;
  }

  const elements = collectShellElements(root);

  const state: MutableAppState = {
    model: createInitialAppModel(),
    isSettingsOpen: false,
    isHistoryModalOpen: false,
    hasLoadedConfig: false,
    recentTopics: [],
    transientBannerMessage: null,
    transientBannerTimeout: null,
    activeRecorder: null,
    activeStream: null,
    activeRecorderToken: 0,
    recordedBlob: null,
    recordedUrl: null,
    activeAbortController: null,
    generationStartedAt: null,
    generationTickerId: null,
    recordingStartedAt: null,
    recordingTickerId: null,
  };

  const closeStep3Details = (): void => {
    (elements.step3Details as HTMLDetailsElement).open = false;
  };

  let rerender: () => void = () => {
    /* placeholder until features are wired */
  };

  const setTransientBanner = (message: string): void => {
    if (state.transientBannerTimeout !== null) {
      clearTimeout(state.transientBannerTimeout);
    }
    state.transientBannerMessage = message;
    state.transientBannerTimeout = setTimeout(() => {
      state.transientBannerMessage = null;
      state.transientBannerTimeout = null;
      rerender();
    }, TRANSIENT_BANNER_DURATION_MS);
  };

  const ctx: AppContext = {
    documentRef,
    elements,
    recordingApi,
    fetchImpl,
    state,
    rerender: () => {
      rerender();
    },
    closeStep3Details,
    clearRecordingArtifacts: () => {
      /* wired up after the recording feature is created */
    },
    setTransientBanner,
  };

  // Recording must be created first so its clearArtifacts can be exposed on ctx
  // for the other features (review, settings, history) to consume.
  const recording = createRecordingFeature(ctx);
  ctx.clearRecordingArtifacts = recording.clearArtifacts;

  const history = createHistoryFeature(ctx);
  const settings = createSettingsFeature(ctx);
  const review = createReviewFeature(ctx);
  const exercise = createExerciseFeature(ctx);

  rerender = (): void => {
    render(
      documentRef,
      elements,
      state.model,
      state.isSettingsOpen,
      state.transientBannerMessage,
      state.recordedUrl,
      history.callbacks,
    );
    history.renderModal();
  };

  recording.attachHandlers();
  exercise.attachHandlers();
  settings.attachHandlers();
  review.attachHandlers();
  history.attachHandlers();

  const initialPageData = readInitialPageData(documentRef);
  state.recentTopics = initialPageData.recent_topics;
  if (initialPageData.initial_topic) {
    state.model = {
      ...state.model,
      settings: {
        ...state.model.settings,
        topic_prompt: initialPageData.initial_topic,
      },
    };
  }

  state.model = {
    ...state.model,
    error_message: LOADING_STATUS,
  };
  rerender();

  try {
    const config = await fetchConfig(fetchImpl);
    const seededTopic = initialPageData.initial_topic;
    state.model = applyLoadedConfig(state.model, config);
    if (seededTopic) {
      state.model = {
        ...state.model,
        settings: { ...state.model.settings, topic_prompt: seededTopic },
      };
    }
    state.hasLoadedConfig = true;
    state.model = {
      ...state.model,
      error_message: null,
    };
  } catch (error) {
    state.model = applyGenerationError(
      state.model,
      getRequestErrorMessage(error, LOAD_ERROR_STATUS),
    );
    state.model = {
      ...state.model,
      flow: 'home',
    };
  }

  rerender();

  if (initialPageData.initial_topic) {
    const match = findRecentTopicMatch(state.recentTopics, initialPageData.initial_topic);
    if (match) {
      history.restoreLanguagesFromEntry(match);
    }
  }
}

if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
  void startApp();
}
