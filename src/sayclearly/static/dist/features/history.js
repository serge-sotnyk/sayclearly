import { loadHistory, loadHistorySession } from '../api_client.js';
import { applyHistoryDetails, applyHistoryError, applyHistoryLoaded, enterHistory, filterRecentTopics, returnFromHistory, reuseTopic, syncAnalysisLanguage, } from '../app_state.js';
export function createHistoryFeature(ctx) {
    const { documentRef, elements, fetchImpl, state } = ctx;
    const renderTopicRow = (list, entries) => {
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
    const renderModal = () => {
        elements.historyModal.hidden = !state.isHistoryModalOpen;
        if (!state.isHistoryModalOpen) {
            return;
        }
        const search = elements.historyModalSearchInput.value;
        const trimmed = search.trim();
        if (state.recentTopics.length === 0) {
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
        renderTopicRow(elements.historyModalAllList, state.recentTopics);
        if (trimmed === '') {
            elements.historyModalMatchesSection.hidden = true;
            elements.historyModalDivider.hidden = true;
            elements.historyModalMatchesList.replaceChildren();
        }
        else {
            elements.historyModalMatchesSection.hidden = false;
            elements.historyModalDivider.hidden = false;
            const matches = filterRecentTopics(state.recentTopics, trimmed);
            if (matches.length === 0) {
                elements.historyModalMatchesList.replaceChildren();
                const note = documentRef.createElement('p');
                note.className = 'history-modal-no-matches';
                note.textContent = 'No matches.';
                elements.historyModalMatchesList.append(note);
            }
            else {
                renderTopicRow(elements.historyModalMatchesList, matches);
            }
        }
    };
    const openModal = () => {
        state.isHistoryModalOpen = true;
        elements.historyModalSearchInput.value = elements.topicInput.value;
        documentRef.body?.classList.add('is-modal-open');
        renderModal();
        if (typeof elements.historyModalSearchInput.focus === 'function') {
            try {
                elements.historyModalSearchInput.focus();
            }
            catch {
                /* ignore focus errors in non-DOM environments */
            }
        }
    };
    const closeModal = () => {
        if (!state.isHistoryModalOpen) {
            return;
        }
        state.isHistoryModalOpen = false;
        documentRef.body?.classList.remove('is-modal-open');
        elements.historyModal.hidden = true;
    };
    const restoreLanguagesFromEntry = (entry) => {
        const sameLanguage = entry.text_language.trim().toLocaleLowerCase() ===
            entry.analysis_language.trim().toLocaleLowerCase();
        const nextSettings = syncAnalysisLanguage({
            ...state.model.settings,
            text_language: entry.text_language,
            analysis_language: entry.analysis_language,
            same_language_for_analysis: sameLanguage,
        });
        state.model = { ...state.model, settings: nextSettings };
        ctx.setTransientBanner(`Languages restored from history: ${entry.text_language} / ${entry.analysis_language}`);
        ctx.rerender();
    };
    const selectHistoryEntry = (entry) => {
        elements.topicInput.value = entry.topic;
        state.model = {
            ...state.model,
            settings: { ...state.model.settings, topic_prompt: entry.topic },
        };
        closeModal();
        restoreLanguagesFromEntry(entry);
    };
    const callbacks = {
        onOpenDetails: async (sessionId) => {
            try {
                const detailed = await loadHistorySession(fetchImpl, sessionId);
                state.model = applyHistoryDetails(state.model, detailed);
            }
            catch {
                state.model = applyHistoryError(state.model, 'Could not load session details. Try again.');
            }
            ctx.rerender();
        },
        onReuseTopic: (topicPrompt) => {
            ctx.clearRecordingArtifacts();
            state.model = reuseTopic(state.model, topicPrompt);
            ctx.rerender();
        },
    };
    const handleOpenHistoryScreen = async () => {
        state.model = enterHistory(state.model, state.model.review !== null ? 'review' : 'home');
        ctx.rerender();
        try {
            const history = await loadHistory(fetchImpl);
            state.model = applyHistoryLoaded(state.model, history);
        }
        catch {
            state.model = applyHistoryError(state.model, 'Could not load saved history. Try again.');
        }
        ctx.rerender();
    };
    const handleHistoryRetry = async () => {
        try {
            if (state.model.history_sessions === null) {
                const history = await loadHistory(fetchImpl);
                state.model = applyHistoryLoaded(state.model, history);
            }
            else {
                const selectedId = state.model.selected_history_session?.id;
                if (!selectedId) {
                    return;
                }
                const session = await loadHistorySession(fetchImpl, selectedId);
                state.model = applyHistoryDetails(state.model, session);
            }
        }
        catch {
            state.model = applyHistoryError(state.model, state.model.history_sessions === null
                ? 'Could not load saved history. Try again.'
                : 'Could not load session details. Try again.');
        }
        ctx.rerender();
    };
    const handleHistoryDetailReuseTopic = () => {
        const topicPrompt = state.model.selected_history_session?.topic_prompt ?? '';
        if (topicPrompt === '') {
            return;
        }
        ctx.clearRecordingArtifacts();
        state.model = reuseTopic(state.model, topicPrompt);
        ctx.rerender();
    };
    const attachHandlers = () => {
        elements.historyButton.addEventListener('click', openModal);
        elements.historyModalCloseButton.addEventListener('click', closeModal);
        elements.historyModalBackdrop.addEventListener('click', closeModal);
        elements.historyModalSearchInput.addEventListener('input', renderModal);
        elements.openHistoryButton.addEventListener('click', handleOpenHistoryScreen);
        elements.historyBackButton.addEventListener('click', () => {
            state.model = returnFromHistory(state.model);
            ctx.rerender();
        });
        elements.historyRetryButton.addEventListener('click', handleHistoryRetry);
        elements.historyDetailReuseTopicButton.addEventListener('click', handleHistoryDetailReuseTopic);
        documentRef.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }
            if (state.isHistoryModalOpen) {
                closeModal();
                return;
            }
            if (elements.apiKeyPopover.classList.contains('is-open')) {
                elements.apiKeyPopover.classList.remove('is-open');
                elements.apiKeyPopoverToggle.setAttribute('aria-expanded', 'false');
            }
        });
    };
    return { attachHandlers, callbacks, renderModal, closeModal, restoreLanguagesFromEntry };
}
