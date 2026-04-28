import { type AppModel } from '../app_state.js';
import { type ShellElements } from '../dom_elements.js';
import { formatHesitations } from './hesitations.js';

export interface HistoryRenderCallbacks {
  onOpenDetails: (sessionId: string) => void;
  onReuseTopic: (topicPrompt: string) => void;
}

function formatScoreLine(label: string, score: number, comment: string | undefined): string {
  const trimmed = comment?.trim();
  if (trimmed) {
    return `${label} ${score}: ${trimmed}`;
  }
  return `${label} score: ${score}`;
}

export function renderHistory(
  documentRef: Document,
  elements: ShellElements,
  model: AppModel,
  callbacks: HistoryRenderCallbacks,
): void {
  elements.historySaveError.hidden = model.history_save_error === null;
  elements.historySaveError.textContent = model.history_save_error ?? '';
  elements.historyError.hidden = model.history_error === null;
  elements.historyError.textContent = model.history_error ?? '';

  const sessions = model.history_sessions ?? [];
  elements.historyEmptyState.hidden = !(
    model.flow === 'history' &&
    sessions.length === 0 &&
    model.history_error === null
  );

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
    detailsButton.addEventListener('click', () => {
      callbacks.onOpenDetails(session.id);
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
      callbacks.onReuseTopic(session.topic_prompt);
    });

    const actions = documentRef.createElement('div');
    actions.className = 'history-card-actions';
    actions.append(detailsButton, reuseButton);

    card.append(meta, summary, actions);
    return card;
  });
  elements.historyList.replaceChildren(...cards);

  const selected = model.selected_history_session;
  elements.historyDetailSummary.textContent =
    selected?.analysis.summary?.join(' ') ??
    'Select a session to inspect its review details.';
  elements.historyDetailMeta.textContent = selected
    ? `${selected.language} • ${selected.topic_prompt ?? 'No topic'}`
    : '';
  elements.historyDetailText.textContent = selected?.text ?? '';
  elements.historyDetailClarity.textContent = selected
    ? formatScoreLine('Clarity', selected.analysis.clarity_score, selected.analysis.clarity_comment)
    : '';
  elements.historyDetailPace.textContent = selected
    ? formatScoreLine('Pace', selected.analysis.pace_score, selected.analysis.pace_comment)
    : '';
  elements.historyDetailHesitations.textContent = selected
    ? formatHesitations(selected.analysis.hesitations)
    : '';
  elements.historyDetailRecommendations.textContent = selected
    ? (selected.analysis.recommendations?.join('\n') ?? '')
    : '';
  elements.historyDetailReuseTopicButton.disabled = !selected?.topic_prompt;
  elements.historyRetryButton.hidden = model.history_error === null;
}
