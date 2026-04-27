import {
  advanceExerciseStep,
  applyAnalysisError,
  applyAnalysisResult,
  applyGeneratedExercise,
  applyGenerationError,
  applyHistoryDetails,
  applyHistoryError,
  applyHistoryLoaded,
  applyHistorySaveError,
  applyLoadedConfig,
  applyRecordingError,
  buildConfigUpdatePayload,
  buildGenerateRequest,
  createInitialAppModel,
  dedupeRecentTopics,
  enterHistory,
  filterRecentTopics,
  findRecentTopicMatch,
  markRecordingStarted,
  pushRecentTopic,
  resetRecording,
  returnFromHistory,
  reuseTopic,
  startNewSession,
  startRecordingAnalysis,
  startRecordingRequest,
  startGeneration,
  storeRecordedAudio,
  syncAnalysisModel,
  syncAnalysisLanguage,
  type AppModel,
  type ConfigUpdatePayload,
  type GeneratedExercise,
  type HistorySession,
  type HistoryStore,
  type InitialPageData,
  type PublicConfig,
  type RecentTopicEntry,
  type RecordingAnalysisResult,
  type SettingsFormState,
} from './app_state.js';
import {
  RequestError,
  analyzeRecording,
  deleteApiKey,
  fetchConfig,
  generateExercise,
  getRequestErrorMessage,
  getRequestErrorMessageWithDetail,
  loadHistory,
  loadHistorySession,
  saveConfig,
  saveHistorySession,
} from './api_client.js';
import {
  collectShellElements,
  type RootLike,
  type ShellElements,
} from './dom_elements.js';

const READY_STATUS = 'Ready to generate a guided exercise.';
const LOADING_STATUS = 'Loading your saved settings...';
const GENERATING_STATUS = 'Generating your guided exercise...';
const LOAD_ERROR_STATUS = 'Could not load your saved settings. You can still enter them manually.';
const GENERATE_ERROR_STATUS = 'Could not generate a guided exercise. Check your settings and try again.';
const ANALYZE_ERROR_STATUS = 'Could not analyze the recording. Try again.';
const CLEAR_ERROR_STATUS = 'Could not clear the stored API key. Try again.';
const TRANSIENT_BANNER_DURATION_MS = 5000;
const EXERCISE_PLACEHOLDER =
  'Your generated exercise text will appear here when the frontend bundle is connected.';

const STEP_CONTENT = {
  step_1_slow: {
    label: 'Step 1 of 3',
    title: 'Slow, exaggerated reading',
    instruction:
      'Read the text very slowly and over-articulate every consonant and word ending.',
    nextButtonLabel: 'Next step',
    nextButtonDisabled: false,
  },
  step_2_natural: {
    label: 'Step 2 of 3',
    title: 'Closer to natural pace',
    instruction:
      'Read the same text again — closer to normal speech, but still a bit slower and clearer than usual.',
    nextButtonLabel: 'Next step',
    nextButtonDisabled: false,
  },
  step_3_retell_ready: {
    label: 'Step 3 of 3',
    title: 'Retell and record',
    instruction:
      'Look away from the text and retell it in your own words, keeping the calm-and-clear style of step 2.',
    nextButtonLabel: 'All steps complete',
    nextButtonDisabled: true,
  },
} as const;

interface RecorderLike {
  addEventListener(type: 'dataavailable' | 'stop', listener: (event: { data?: Blob }) => void): void;
  start(): void;
  stop(): void;
}

interface RecordingApi {
  isSupported(): boolean;
  getUserMedia(): Promise<unknown>;
  createMediaRecorder(stream: unknown): RecorderLike;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

interface StreamLike {
  getTracks(): Array<{ stop(): void }>;
}

function createDefaultRecordingApi(): RecordingApi {
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

function formatModelLabel(model: PublicConfig['gemini']['available_models'][number]): string {
  if (model.free_tier_requests_per_day_hint === null) {
    return model.label;
  }

  return `${model.label} (${model.free_tier_requests_per_day_hint} RPD hint)`;
}

function renderModelOptions(
  documentRef: Document,
  select: HTMLSelectElement,
  models: PublicConfig['gemini']['available_models'],
): void {
  const options = models.map((model) => {
    const option = documentRef.createElement('option');
    option.value = model.id;
    option.textContent = formatModelLabel(model);
    return option;
  });

  select.replaceChildren(...options);
}

function getSettingsStatus(config: PublicConfig): string {
  if (config.gemini.has_api_key) {
    if (config.gemini.api_key_source === 'env') {
      return 'API key status: available from environment variables.';
    }

    return 'API key status: stored locally.';
  }

  return 'API key status: not stored locally.';
}

function getApiKeyHint(config: PublicConfig): string {
  if (config.gemini.api_key_source === 'env') {
    return 'Using the Gemini API key from .env for this session.';
  }

  if (config.gemini.has_api_key) {
    return 'A Gemini API key is stored locally. Paste a new key to replace it.';
  }

  return 'Paste a key here or use .env for local development.';
}

function getApiKeyPlaceholder(config: PublicConfig): string {
  if (config.gemini.api_key_source === 'env') {
    return 'Using API key from environment';
  }

  if (config.gemini.has_api_key) {
    return 'Stored locally. Paste a new key to replace it';
  }

  return 'Paste your local API key';
}

function getLocalStorageNote(config: PublicConfig): string {
  if (config.gemini.api_key_source === 'env') {
    return 'Runs fully locally on your machine. Bring your own Gemini API key. The current key comes from environment variables for this session.';
  }

  if (config.gemini.has_api_key) {
    return 'Runs fully locally on your machine. Bring your own Gemini API key. The current key is stored only in your local config on this computer.';
  }

  return 'Runs fully locally on your machine. Bring your own Gemini API key. Add it here or through .env for this session.';
}

function getTelemetryNote(config: PublicConfig): string {
  if (config.langfuse.enabled) {
    return 'Optional telemetry is active because Langfuse is configured in this environment.';
  }

  return 'Optional telemetry stays off unless Langfuse is configured.';
}

function getStatusMessage(model: AppModel, transientBannerMessage: string | null): string {
  if (model.error_message) {
    return model.error_message;
  }

  if (model.flow === 'generating_text') {
    return GENERATING_STATUS;
  }

  if (transientBannerMessage) {
    return transientBannerMessage;
  }

  if (model.generated_exercise) {
    return 'Exercise ready. Follow the current speaking step.';
  }

  return READY_STATUS;
}

function readSettings(elements: ShellElements): SettingsFormState {
  return syncAnalysisModel(
    syncAnalysisLanguage({
      text_language: elements.textLanguageInput.value.trim(),
      analysis_language: elements.analysisLanguageInput.value.trim(),
      same_language_for_analysis: elements.sameLanguageToggle.checked,
      text_model: elements.textModelSelect.value,
      analysis_model: elements.analysisModelSelect.value,
      same_model_for_analysis: elements.sameModelToggle.checked,
      text_thinking_level: elements.thinkingLevelSelect.value as SettingsFormState['text_thinking_level'],
      topic_prompt: elements.topicInput.value,
    }),
  );
}

function readInitialPageData(documentRef: Document): InitialPageData {
  const fallback: InitialPageData = { recent_topics: [], initial_topic: null };
  const node = documentRef.querySelector<HTMLScriptElement>(
    'script[data-recent-topics-payload]',
  );
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

function buildConfigRequest(
  config: PublicConfig,
  settings: SettingsFormState,
  apiKeyValue: string,
): ConfigUpdatePayload {
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

function createClientSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildHistorySession(
  exercise: GeneratedExercise,
  analysis: RecordingAnalysisResult['analysis'],
): HistorySession {
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


function render(
  documentRef: Document,
  elements: ShellElements,
  model: AppModel,
  isSettingsOpen: boolean,
  transientBannerMessage: string | null,
  recordedUrl: string | null,
  fetchImpl: typeof fetch,
  clearRecordingArtifacts: () => void,
): void {
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
  elements.statusMessage.textContent = getStatusMessage(model, transientBannerMessage);
  elements.settingsPanel.hidden = !isSettingsOpen;

  const generatedExercise = model.generated_exercise;
  const hasExercise = generatedExercise !== null;
  const showRecordingControls =
    hasExercise &&
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
  const isGenerating = model.flow === 'generating_text';
  elements.generateButton.disabled = isGenerating;
  elements.historyButton.disabled = isGenerating;
  elements.generateSpinner.hidden = !isGenerating;
  elements.generateLabel.textContent = isGenerating ? 'Generating...' : 'Generate';
  elements.cancelGenerateButton.hidden = !isGenerating;
  elements.recordingControls.hidden = !showRecordingControls;
  elements.startRecordingButton.hidden = model.flow !== 'step_3_retell_ready';
  elements.stopRecordingButton.hidden = model.flow !== 'recording';
  elements.analyzeRecordingButton.hidden = model.flow !== 'recorded';
  elements.cancelAnalyzeButton.hidden = model.flow !== 'analyzing';
  elements.recordAgainButton.hidden = !['recorded', 'review'].includes(model.flow);
  elements.recordingPreview.hidden = recordedUrl === null;
  elements.recordingPreview.src = recordedUrl ?? '';
  elements.reviewPanel.hidden = model.review === null;
  elements.reviewActions.hidden = model.flow !== 'review' || model.review === null;
  elements.reviewSummary.textContent = model.review?.summary ?? '';
  elements.reviewClarity.textContent = model.review?.clarity ?? '';
  elements.reviewPace.textContent = model.review?.pace ?? '';
  elements.reviewHesitations.textContent = model.review?.hesitations?.join('\n') ?? '';
  elements.reviewRecommendations.textContent = model.review?.recommendations?.join('\n') ?? '';

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
    summary.textContent = session.analysis.summary?.[0] ?? 'No summary yet.';

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
      } catch {
        model = applyHistoryError(model, 'Could not load session details. Try again.');
      }
      render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
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
      render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });

    const actions = documentRef.createElement('div');
    actions.className = 'history-card-actions';
    actions.append(detailsButton, reuseButton);

    card.append(meta, summary, actions);
    return card;
  });
  elements.historyList.replaceChildren(...cards);

  const selected = model.selected_history_session;
  elements.historyDetailSummary.textContent = selected?.analysis.summary?.join(' ') ?? 'Select a session to inspect its review details.';
  elements.historyDetailMeta.textContent = selected ? `${selected.language} • ${selected.topic_prompt ?? 'No topic'}` : '';
  elements.historyDetailText.textContent = selected?.text ?? '';
  elements.historyDetailClarity.textContent = selected ? `Clarity score: ${selected.analysis.clarity_score}` : '';
  elements.historyDetailPace.textContent = selected ? `Pace score: ${selected.analysis.pace_score}` : '';
  elements.historyDetailHesitations.textContent = selected
    ? (selected.analysis.hesitations
        ?.map((h) => `${h.note} (${h.start.toFixed(1)}s-${h.end.toFixed(1)}s)`)
        .join('\n') ?? '')
    : '';
  elements.historyDetailReuseTopicButton.disabled = !selected?.topic_prompt;
  elements.historyRetryButton.hidden = model.history_error === null;

  if (model.recording_error) {
    elements.recordingStatusText.textContent = model.recording_error;
  } else {
    switch (model.flow) {
      case 'requesting_microphone':
        elements.recordingStatusText.textContent = 'Requesting microphone access...';
        break;
      case 'recording':
        elements.recordingStatusText.textContent = 'Recording in progress. Stop when your retelling is complete.';
        break;
      case 'recorded':
        elements.recordingStatusText.textContent = 'Recording ready. Listen back or upload it for feedback.';
        break;
      case 'analyzing':
        elements.recordingStatusText.textContent = 'Uploading your recording for feedback...';
        break;
      case 'review':
        elements.recordingStatusText.textContent = 'Review ready. Record again when you want another attempt.';
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

  const isStep3Like = [
    'step_3_retell_ready',
    'requesting_microphone',
    'recording',
    'recorded',
    'analyzing',
    'review',
  ].includes(model.flow);
  if (hasExercise && !isStep3Like) {
    elements.step3Details.classList.add('is-locked-open');
    (elements.step3Details as HTMLDetailsElement).open = true;
  } else {
    elements.step3Details.classList.remove('is-locked-open');
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

  const stepContent = STEP_CONTENT[model.flow as keyof typeof STEP_CONTENT] ?? STEP_CONTENT.step_1_slow;
  elements.stepLabel.textContent = stepContent.label;
  elements.stepTitle.textContent = stepContent.title;
  elements.stepInstruction.textContent = stepContent.instruction;
  elements.nextStepButton.textContent = stepContent.nextButtonLabel;
  elements.nextStepButton.disabled = stepContent.nextButtonDisabled;
  elements.nextStepButton.hidden = showRecordingControls;
  elements.exerciseText.textContent = generatedExercise.text;
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
  let model = createInitialAppModel();
  let isSettingsOpen = false;
  let isHistoryModalOpen = false;
  let hasLoadedConfig = false;
  let recentTopics: RecentTopicEntry[] = [];
  let transientBannerMessage: string | null = null;
  let transientBannerTimeout: ReturnType<typeof setTimeout> | null = null;
  let activeRecorder: RecorderLike | null = null;
  let activeStream: StreamLike | null = null;
  let activeRecorderToken = 0;
  let recordedBlob: Blob | null = null;
  let recordedUrl: string | null = null;
  let activeAbortController: AbortController | null = null;
  let generationStartedAt: number | null = null;
  let generationTickerId: ReturnType<typeof setInterval> | null = null;
  let recordingStartedAt: number | null = null;
  let recordingTickerId: ReturnType<typeof setInterval> | null = null;
  const RECORDING_WARN_AFTER_SECONDS = 300;
  const RECORDING_WARNING_SUFFIX = ' Long recordings may not analyze well.';

  const formatDuration = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const stopGenerationTicker = (): void => {
    if (generationTickerId !== null) {
      clearInterval(generationTickerId);
      generationTickerId = null;
    }
    generationStartedAt = null;
  };

  const stopRecordingTicker = (): void => {
    if (recordingTickerId !== null) {
      clearInterval(recordingTickerId);
      recordingTickerId = null;
    }
    recordingStartedAt = null;
    elements.recordingTimer.textContent = '';
  };

  const closeStep3Details = (): void => {
    (elements.step3Details as HTMLDetailsElement).open = false;
  };

  const stopStream = (stream: StreamLike | null): void => {
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
  };

  const stopActiveStream = (): void => {
    stopStream(activeStream);
    activeStream = null;
  };

  const clearRecordingArtifacts = (): void => {
    activeRecorderToken += 1;
    activeRecorder = null;
    stopActiveStream();
    stopRecordingTicker();
    recordedBlob = null;
    if (recordedUrl !== null) {
      recordingApi.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }
  };

  const updateSettings = (nextSettings: SettingsFormState): void => {
    model = {
      ...model,
      settings: nextSettings,
    };
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  };

  const refreshFromInputs = (): void => {
    updateSettings(readSettings(elements));
  };

  const renderAll = (): void => {
    render(
      documentRef,
      elements,
      model,
      isSettingsOpen,
      transientBannerMessage,
      recordedUrl,
      fetchImpl,
      clearRecordingArtifacts,
    );
    renderHistoryModal();
  };

  const setTransientBanner = (message: string): void => {
    if (transientBannerTimeout !== null) {
      clearTimeout(transientBannerTimeout);
    }
    transientBannerMessage = message;
    transientBannerTimeout = setTimeout(() => {
      transientBannerMessage = null;
      transientBannerTimeout = null;
      renderAll();
    }, TRANSIENT_BANNER_DURATION_MS);
  };

  const restoreLanguagesFromEntry = (entry: RecentTopicEntry): void => {
    const sameLanguage =
      entry.text_language.trim().toLocaleLowerCase() ===
      entry.analysis_language.trim().toLocaleLowerCase();
    const nextSettings: SettingsFormState = syncAnalysisLanguage({
      ...model.settings,
      text_language: entry.text_language,
      analysis_language: entry.analysis_language,
      same_language_for_analysis: sameLanguage,
    });
    model = { ...model, settings: nextSettings };
    setTransientBanner(
      `Languages restored from history: ${entry.text_language} / ${entry.analysis_language}`,
    );
    renderAll();
  };

  const renderTopicRow = (
    list: HTMLElement,
    entries: RecentTopicEntry[],
  ): void => {
    list.replaceChildren();
    for (const entry of entries) {
      const item = documentRef.createElement('li');
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'history-modal-row';
      button.setAttribute('data-history-modal-row', '');
      const topic = documentRef.createElement('span');
      topic.className = 'history-modal-row-topic';
      topic.textContent = entry.topic;
      const meta = documentRef.createElement('span');
      meta.className = 'history-modal-row-meta';
      meta.textContent = `${entry.text_language} / ${entry.analysis_language}`;
      button.append(topic, meta);
      button.addEventListener('click', () => {
        selectHistoryEntry(entry);
      });
      item.append(button);
      list.append(item);
    }
  };

  const renderHistoryModal = (): void => {
    elements.historyModal.hidden = !isHistoryModalOpen;
    if (!isHistoryModalOpen) {
      return;
    }

    const search = elements.historyModalSearchInput.value;
    const trimmed = search.trim();

    if (recentTopics.length === 0) {
      elements.historyModalEmpty.hidden = false;
      elements.historyModalMatchesSection.hidden = true;
      elements.historyModalDivider.hidden = true;
      elements.historyModalAllSection.hidden = true;
      elements.historyModalMatchesList.replaceChildren();
      elements.historyModalAllList.replaceChildren();
      return;
    }

    elements.historyModalEmpty.hidden = true;
    elements.historyModalAllSection.hidden = false;
    renderTopicRow(elements.historyModalAllList, recentTopics);

    if (trimmed === '') {
      elements.historyModalMatchesSection.hidden = true;
      elements.historyModalDivider.hidden = true;
      elements.historyModalMatchesList.replaceChildren();
    } else {
      elements.historyModalMatchesSection.hidden = false;
      elements.historyModalDivider.hidden = false;
      const matches = filterRecentTopics(recentTopics, trimmed);
      if (matches.length === 0) {
        elements.historyModalMatchesList.replaceChildren();
        const note = documentRef.createElement('p');
        note.className = 'history-modal-no-matches';
        note.textContent = 'No matches.';
        elements.historyModalMatchesList.append(note);
      } else {
        renderTopicRow(elements.historyModalMatchesList, matches);
      }
    }
  };

  const openHistoryModal = (): void => {
    isHistoryModalOpen = true;
    elements.historyModalSearchInput.value = elements.topicInput.value;
    documentRef.body?.classList.add('is-modal-open');
    renderHistoryModal();
    if (typeof elements.historyModalSearchInput.focus === 'function') {
      try {
        elements.historyModalSearchInput.focus();
      } catch {
        /* ignore focus errors in non-DOM environments */
      }
    }
  };

  const closeHistoryModal = (): void => {
    if (!isHistoryModalOpen) {
      return;
    }
    isHistoryModalOpen = false;
    documentRef.body?.classList.remove('is-modal-open');
    elements.historyModal.hidden = true;
  };

  const selectHistoryEntry = (entry: RecentTopicEntry): void => {
    elements.topicInput.value = entry.topic;
    model = {
      ...model,
      settings: { ...model.settings, topic_prompt: entry.topic },
    };
    closeHistoryModal();
    restoreLanguagesFromEntry(entry);
  };

  elements.openSettingsButton.addEventListener('click', () => {
    isSettingsOpen = true;
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.closeSettingsButton.addEventListener('click', () => {
    isSettingsOpen = false;
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
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
    refreshFromInputs();
  });

  elements.historyButton.addEventListener('click', () => {
    openHistoryModal();
  });

  elements.historyModalCloseButton.addEventListener('click', () => {
    closeHistoryModal();
  });

  elements.historyModalBackdrop.addEventListener('click', () => {
    closeHistoryModal();
  });

  elements.historyModalSearchInput.addEventListener('input', () => {
    renderHistoryModal();
  });

  elements.nextStepButton.addEventListener('click', () => {
    model = advanceExerciseStep(model);
    if (model.flow === 'step_3_retell_ready') {
      closeStep3Details();
    }
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.cancelGenerateButton.addEventListener('click', () => {
    activeAbortController?.abort();
  });

  elements.cancelAnalyzeButton.addEventListener('click', () => {
    activeAbortController?.abort();
  });

  elements.apiKeyPopoverToggle.addEventListener('click', (event) => {
    event.preventDefault();
    const isOpen = elements.apiKeyPopover.classList.toggle('is-open');
    elements.apiKeyPopoverToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  documentRef.addEventListener('click', (event) => {
    if (!elements.apiKeyPopover.classList.contains('is-open')) {
      return;
    }
    const target = event.target as Node | null;
    if (target && elements.apiKeyPopover.contains(target)) {
      return;
    }
    elements.apiKeyPopover.classList.remove('is-open');
    elements.apiKeyPopoverToggle.setAttribute('aria-expanded', 'false');
  });

  documentRef.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key !== 'Escape') {
      return;
    }
    if (isHistoryModalOpen) {
      closeHistoryModal();
      return;
    }
    if (elements.apiKeyPopover.classList.contains('is-open')) {
      elements.apiKeyPopover.classList.remove('is-open');
      elements.apiKeyPopoverToggle.setAttribute('aria-expanded', 'false');
    }
  });

  elements.startRecordingButton.addEventListener('click', async () => {
    if (!recordingApi.isSupported()) {
      model = applyRecordingError(model, 'This browser does not support microphone recording.');
      render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
      return;
    }

    model = startRecordingRequest(model);
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);

    const recorderToken = activeRecorderToken + 1;
    activeRecorderToken = recorderToken;

    try {
      const stream = await recordingApi.getUserMedia();
      if (recorderToken !== activeRecorderToken) {
        stopStream(stream as StreamLike);
        return;
      }

      activeStream = stream as StreamLike;
      const recorder = recordingApi.createMediaRecorder(stream);
      const chunks: Blob[] = [];
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
          render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
          return;
        }

        if (recordedUrl !== null) {
          recordingApi.revokeObjectURL(recordedUrl);
        }
        recordedBlob = blob;
        recordedUrl = recordingApi.createObjectURL(blob);
        model = storeRecordedAudio(model);
        render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
      });
      recorder.start();
      model = markRecordingStarted(model);
      recordingStartedAt = Date.now();
      elements.recordingTimer.textContent = formatDuration(0);
      const tickRecording = (): void => {
        if (recordingStartedAt === null) {
          return;
        }
        const elapsed = Math.floor((Date.now() - recordingStartedAt) / 1000);
        elements.recordingTimer.textContent = formatDuration(elapsed);
        if (elapsed >= RECORDING_WARN_AFTER_SECONDS) {
          const baseText = 'Recording in progress. Stop when your retelling is complete.';
          elements.recordingStatusText.textContent = baseText + RECORDING_WARNING_SUFFIX;
        }
      };
      recordingTickerId = setInterval(tickRecording, 1000);
    } catch {
      if (recorderToken !== activeRecorderToken) {
        return;
      }
      activeRecorder = null;
      stopActiveStream();
      stopRecordingTicker();
      model = applyRecordingError(model, 'Microphone access was unavailable. Please try again.');
      closeStep3Details();
    }

    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.stopRecordingButton.addEventListener('click', () => {
    stopRecordingTicker();
    activeRecorder?.stop();
  });

  elements.analyzeRecordingButton.addEventListener('click', async () => {
    if (recordedBlob === null) {
      model = applyRecordingError(model, 'No recording was captured. Please try again.');
      render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
      return;
    }

    model = startRecordingAnalysis(model);
    const controller = new AbortController();
    activeAbortController = controller;
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);

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
      const result = await analyzeRecording(fetchImpl, formData, controller.signal);
      const latestSession = buildHistorySession(model.generated_exercise!, result.analysis);
      model = applyAnalysisResult(model, result, latestSession);
      try {
        const history = await saveHistorySession(fetchImpl, latestSession);
        model = applyHistoryLoaded(model, history);
        const newTopic = latestSession.topic_prompt?.trim();
        if (newTopic) {
          recentTopics = pushRecentTopic(recentTopics, {
            topic: newTopic,
            text_language: latestSession.language,
            analysis_language: latestSession.analysis_language ?? latestSession.language,
          });
        }
      } catch {
        model = applyHistorySaveError(
          model,
          'Review is ready, but this session was not saved to history.',
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        model = storeRecordedAudio(model);
      } else {
        model = applyAnalysisError(
          model,
          getRequestErrorMessageWithDetail(error, ANALYZE_ERROR_STATUS),
        );
      }
    } finally {
      if (activeAbortController === controller) {
        activeAbortController = null;
      }
    }

    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.recordAgainButton.addEventListener('click', () => {
    clearRecordingArtifacts();
    model = resetRecording(model);
    closeStep3Details();
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.resetButton.addEventListener('click', () => {
    clearRecordingArtifacts();
    const resetModel = createInitialAppModel();
    model = applyLoadedConfig(resetModel, model.config);
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.clearApiKeyButton.addEventListener('click', async () => {
    try {
      const config = await deleteApiKey(fetchImpl);
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
      render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
    } catch {
      elements.settingsStatus.textContent = CLEAR_ERROR_STATUS;
    }
  });

  for (const button of elements.newSessionButtons) {
    button.addEventListener('click', () => {
      clearRecordingArtifacts();
      model = startNewSession(model);
      render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
    });
  }

  elements.reviewReuseTopicButton.addEventListener('click', () => {
    const topicPrompt = model.latest_session?.topic_prompt ?? '';
    if (topicPrompt === '') {
      return;
    }
    clearRecordingArtifacts();
    model = reuseTopic(model, topicPrompt);
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.openHistoryButton.addEventListener('click', async () => {
    model = enterHistory(model, model.review !== null ? 'review' : 'home');
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
    try {
      const history = await loadHistory(fetchImpl);
      model = applyHistoryLoaded(model, history);
    } catch {
      model = applyHistoryError(model, 'Could not load saved history. Try again.');
    }
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.historyBackButton.addEventListener('click', () => {
    model = returnFromHistory(model);
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.historyRetryButton.addEventListener('click', async () => {
    try {
      if (model.history_sessions === null) {
        const history = await loadHistory(fetchImpl);
        model = applyHistoryLoaded(model, history);
      } else {
        const selectedId = model.selected_history_session?.id;
        if (!selectedId) {
          return;
        }
        const session = await loadHistorySession(fetchImpl, selectedId);
        model = applyHistoryDetails(model, session);
      }
    } catch {
      model = applyHistoryError(
        model,
        model.history_sessions === null
          ? 'Could not load saved history. Try again.'
          : 'Could not load session details. Try again.',
      );
    }
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.historyDetailReuseTopicButton.addEventListener('click', () => {
    const topicPrompt = model.selected_history_session?.topic_prompt ?? '';
    if (topicPrompt === '') {
      return;
    }
    clearRecordingArtifacts();
    model = reuseTopic(model, topicPrompt);
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  elements.generateButton.addEventListener('click', async () => {
    const settings = readSettings(elements);
    model = {
      ...model,
      settings,
    };
    model = startGeneration(model);

    const controller = new AbortController();
    activeAbortController = controller;
    generationStartedAt = Date.now();
    const tickGeneration = (): void => {
      if (generationStartedAt === null) {
        return;
      }
      const elapsed = Math.floor((Date.now() - generationStartedAt) / 1000);
      elements.statusMessage.textContent = `${GENERATING_STATUS} (${elapsed}s)`;
    };
    generationTickerId = setInterval(tickGeneration, 1000);
    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);

    try {
      let configForSave = model.config;
      if (!hasLoadedConfig) {
        try {
          configForSave = await fetchConfig(fetchImpl, controller.signal);
          model = {
            ...applyLoadedConfig(model, configForSave),
            settings,
          };
          hasLoadedConfig = true;
        } catch (error) {
          if (controller.signal.aborted) {
            throw error;
          }
          throw new RequestError('Request failed: /api/config', getRequestErrorMessage(error, LOAD_ERROR_STATUS));
        }
      }

      const savedConfig = await saveConfig(
        fetchImpl,
        buildConfigRequest(configForSave, settings, elements.apiKeyInput.value),
        controller.signal,
      );
      hasLoadedConfig = true;
      model = {
        ...model,
        config: savedConfig,
        settings,
      };

      const exercise = await generateExercise(
        fetchImpl,
        buildGenerateRequest(settings),
        controller.signal,
      );
      model = applyGeneratedExercise(model, exercise);
    } catch (error) {
      if (controller.signal.aborted) {
        model = {
          ...model,
          flow: 'home',
          error_message: null,
        };
      } else {
        model = applyGenerationError(
          model,
          getRequestErrorMessageWithDetail(error, GENERATE_ERROR_STATUS),
        );
      }
    } finally {
      stopGenerationTicker();
      if (activeAbortController === controller) {
        activeAbortController = null;
      }
    }

    render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);
  });

  const initialPageData = readInitialPageData(documentRef);
  recentTopics = initialPageData.recent_topics;
  if (initialPageData.initial_topic) {
    model = {
      ...model,
      settings: {
        ...model.settings,
        topic_prompt: initialPageData.initial_topic,
      },
    };
  }

  model = {
    ...model,
    error_message: LOADING_STATUS,
  };
  render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);

  try {
    const config = await fetchConfig(fetchImpl);
    const seededTopic = initialPageData.initial_topic;
    model = applyLoadedConfig(model, config);
    if (seededTopic) {
      model = {
        ...model,
        settings: { ...model.settings, topic_prompt: seededTopic },
      };
    }
    hasLoadedConfig = true;
    model = {
      ...model,
      error_message: null,
    };
  } catch (error) {
    model = applyGenerationError(model, getRequestErrorMessage(error, LOAD_ERROR_STATUS));
    model = {
      ...model,
      flow: 'home',
    };
  }

  render(documentRef, elements, model, isSettingsOpen, transientBannerMessage, recordedUrl, fetchImpl, clearRecordingArtifacts);

  if (initialPageData.initial_topic) {
    const match = findRecentTopicMatch(recentTopics, initialPageData.initial_topic);
    if (match) {
      restoreLanguagesFromEntry(match);
    }
  }
}

if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
  void startApp();
}
