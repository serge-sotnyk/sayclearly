export type RootLike = ParentNode & {
  querySelector<E extends Element = Element>(selector: string): E | null;
  querySelectorAll<E extends Element = Element>(selector: string): NodeListOf<E>;
};

export interface ShellElements {
  setupScreen: HTMLElement;
  exerciseScreen: HTMLElement;
  reviewActions: HTMLElement;
  settingsModal: HTMLElement;
  settingsModalBackdrop: HTMLElement;
  settingsModalCloseButton: HTMLButtonElement;
  openSettingsButton: HTMLButtonElement;
  closeSettingsButtons: HTMLButtonElement[];
  saveSettingsButton: HTMLButtonElement;
  sessionLimitInput: HTMLInputElement;
  clearHistoryButton: HTMLButtonElement;
  statusMessage: HTMLElement;
  settingsStatus: HTMLElement;
  clearApiKeyButton: HTMLButtonElement;
  apiKeyInput: HTMLInputElement;
  apiKeyHint: HTMLElement;
  textModelSelect: HTMLSelectElement;
  analysisModelSelect: HTMLSelectElement;
  sameModelToggle: HTMLInputElement;
  thinkingLevelSelect: HTMLSelectElement;
  textLanguageInput: HTMLSelectElement;
  analysisLanguageInput: HTMLSelectElement;
  sameLanguageToggle: HTMLInputElement;
  topicInput: HTMLInputElement;
  historyButton: HTMLButtonElement;
  historyModal: HTMLElement;
  historyModalBackdrop: HTMLElement;
  historyModalCloseButton: HTMLButtonElement;
  historyModalSearchInput: HTMLInputElement;
  historyModalEmpty: HTMLElement;
  historyModalMatchesSection: HTMLElement;
  historyModalMatchesList: HTMLElement;
  historyModalDivider: HTMLElement;
  historyModalAllSection: HTMLElement;
  historyModalAllList: HTMLElement;
  generateButton: HTMLButtonElement;
  generateSpinner: HTMLElement;
  generateLabel: HTMLElement;
  cancelGenerateButton: HTMLButtonElement;
  apiKeyPopover: HTMLElement;
  apiKeyPopoverToggle: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  nextStepButton: HTMLButtonElement;
  recordingControls: HTMLElement;
  recordingStatus: HTMLElement;
  recordingStatusText: HTMLElement;
  recordingTimer: HTMLElement;
  startRecordingButton: HTMLButtonElement;
  stopRecordingButton: HTMLButtonElement;
  analyzeRecordingButton: HTMLButtonElement;
  cancelAnalyzeButton: HTMLButtonElement;
  recordAgainButton: HTMLButtonElement;
  step3Details: HTMLElement;
  recordingPreview: HTMLMediaElement;
  reviewPanel: HTMLElement;
  reviewSummary: HTMLElement;
  reviewClarity: HTMLElement;
  reviewPace: HTMLElement;
  reviewHesitations: HTMLElement;
  reviewRecommendations: HTMLElement;
  stepLabel: HTMLElement;
  stepTitle: HTMLElement;
  stepInstruction: HTMLElement;
  exerciseText: HTMLElement;
  historyScreen: HTMLElement;
  newSessionButtons: HTMLButtonElement[];
  reviewReuseTopicButton: HTMLButtonElement;
  openHistoryButton: HTMLButtonElement;
  historyList: HTMLElement;
  historyEmptyState: HTMLElement;
  historyError: HTMLElement;
  historySaveError: HTMLElement;
  historyRetryButton: HTMLButtonElement;
  historyBackButton: HTMLButtonElement;
  historyDetails: HTMLElement;
  historyDetailSummary: HTMLElement;
  historyDetailMeta: HTMLElement;
  historyDetailText: HTMLElement;
  historyDetailClarity: HTMLElement;
  historyDetailPace: HTMLElement;
  historyDetailHesitations: HTMLElement;
  historyDetailReuseTopicButton: HTMLButtonElement;
  localStorageNote: HTMLElement;
  telemetryNote: HTMLElement;
}

export function getRequiredElement<E extends Element>(root: RootLike, selector: string): E {
  const element = root.querySelector<E>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

export function collectShellElements(root: RootLike): ShellElements {
  return {
    setupScreen: getRequiredElement(root, '[data-screen="setup"]'),
    exerciseScreen: getRequiredElement(root, '[data-screen="exercise"]'),
    reviewActions: getRequiredElement(root, '[data-review-actions]'),
    settingsModal: getRequiredElement(root, '[data-settings-modal]'),
    settingsModalBackdrop: getRequiredElement(root, '[data-settings-modal-backdrop]'),
    settingsModalCloseButton: getRequiredElement(root, '[data-settings-modal-close]'),
    openSettingsButton: getRequiredElement(root, '[data-open-settings-button]'),
    closeSettingsButtons: Array.from(root.querySelectorAll('[data-close-settings-button]')),
    saveSettingsButton: getRequiredElement(root, '[data-save-settings-button]'),
    sessionLimitInput: getRequiredElement(root, '[data-session-limit-input]'),
    clearHistoryButton: getRequiredElement(root, '[data-clear-history-button]'),
    statusMessage: getRequiredElement(root, '[data-status-message]'),
    settingsStatus: getRequiredElement(root, '[data-settings-status]'),
    clearApiKeyButton: getRequiredElement(root, '[data-clear-api-key-button]'),
    apiKeyInput: getRequiredElement(root, '[data-api-key-input]'),
    apiKeyHint: getRequiredElement(root, '[data-api-key-hint]'),
    textModelSelect: getRequiredElement(root, '[data-text-model-select]'),
    analysisModelSelect: getRequiredElement(root, '[data-analysis-model-select]'),
    sameModelToggle: getRequiredElement(root, '[data-same-model-toggle]'),
    thinkingLevelSelect: getRequiredElement(root, '[data-thinking-level-select]'),
    textLanguageInput: getRequiredElement(root, '[data-text-language-input]'),
    analysisLanguageInput: getRequiredElement(root, '[data-analysis-language-input]'),
    sameLanguageToggle: getRequiredElement(root, '[data-same-language-toggle]'),
    topicInput: getRequiredElement(root, '[data-topic-input]'),
    historyButton: getRequiredElement(root, '[data-history-button]'),
    historyModal: getRequiredElement(root, '[data-history-modal]'),
    historyModalBackdrop: getRequiredElement(root, '[data-history-modal-backdrop]'),
    historyModalCloseButton: getRequiredElement(root, '[data-history-modal-close]'),
    historyModalSearchInput: getRequiredElement(root, '[data-history-modal-search]'),
    historyModalEmpty: getRequiredElement(root, '[data-history-modal-empty]'),
    historyModalMatchesSection: getRequiredElement(root, '[data-history-modal-matches-section]'),
    historyModalMatchesList: getRequiredElement(root, '[data-history-modal-matches-list]'),
    historyModalDivider: getRequiredElement(root, '[data-history-modal-divider]'),
    historyModalAllSection: getRequiredElement(root, '[data-history-modal-all-section]'),
    historyModalAllList: getRequiredElement(root, '[data-history-modal-all-list]'),
    generateButton: getRequiredElement(root, '[data-generate-button]'),
    generateSpinner: getRequiredElement(root, '[data-generate-spinner]'),
    generateLabel: getRequiredElement(root, '[data-generate-label]'),
    cancelGenerateButton: getRequiredElement(root, '[data-cancel-generate-button]'),
    apiKeyPopover: getRequiredElement(root, '[data-api-key-popover]'),
    apiKeyPopoverToggle: getRequiredElement(root, '[data-info-popover-toggle]'),
    resetButton: getRequiredElement(root, '[data-reset-button]'),
    nextStepButton: getRequiredElement(root, '[data-next-step-button]'),
    recordingControls: getRequiredElement(root, '[data-recording-controls]'),
    recordingStatus: getRequiredElement(root, '[data-recording-status]'),
    recordingStatusText: getRequiredElement(root, '[data-recording-status-text]'),
    recordingTimer: getRequiredElement(root, '[data-recording-timer]'),
    startRecordingButton: getRequiredElement(root, '[data-start-recording-button]'),
    stopRecordingButton: getRequiredElement(root, '[data-stop-recording-button]'),
    analyzeRecordingButton: getRequiredElement(root, '[data-analyze-recording-button]'),
    cancelAnalyzeButton: getRequiredElement(root, '[data-cancel-analyze-button]'),
    recordAgainButton: getRequiredElement(root, '[data-record-again-button]'),
    step3Details: getRequiredElement(root, '[data-step3-details]'),
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
    historyScreen: getRequiredElement(root, '[data-screen="history"]'),
    newSessionButtons: Array.from(root.querySelectorAll('[data-new-session-button]')),
    reviewReuseTopicButton: getRequiredElement(root, '[data-review-reuse-topic-button]'),
    openHistoryButton: getRequiredElement(root, '[data-open-history-button]'),
    historyList: getRequiredElement(root, '[data-history-list]'),
    historyEmptyState: getRequiredElement(root, '[data-history-empty-state]'),
    historyError: getRequiredElement(root, '[data-history-error]'),
    historySaveError: getRequiredElement(root, '[data-history-save-error]'),
    historyRetryButton: getRequiredElement(root, '[data-history-retry-button]'),
    historyBackButton: getRequiredElement(root, '[data-history-back-button]'),
    historyDetails: getRequiredElement(root, '[data-history-details]'),
    historyDetailSummary: getRequiredElement(root, '[data-history-detail-summary]'),
    historyDetailMeta: getRequiredElement(root, '[data-history-detail-meta]'),
    historyDetailText: getRequiredElement(root, '[data-history-detail-text]'),
    historyDetailClarity: getRequiredElement(root, '[data-history-detail-clarity]'),
    historyDetailPace: getRequiredElement(root, '[data-history-detail-pace]'),
    historyDetailHesitations: getRequiredElement(root, '[data-history-detail-hesitations]'),
    historyDetailReuseTopicButton: getRequiredElement(
      root,
      '[data-history-detail-reuse-topic-button]',
    ),
    localStorageNote: getRequiredElement(root, '[data-local-storage-note]'),
    telemetryNote: getRequiredElement(root, '[data-telemetry-note]'),
  };
}
