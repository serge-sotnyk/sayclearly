import { type AppModel } from '../app_state.js';
import { type ShellElements } from '../dom_elements.js';

export function renderReview(elements: ShellElements, model: AppModel): void {
  elements.reviewPanel.hidden = model.review === null;
  elements.reviewActions.hidden = model.flow !== 'review' || model.review === null;
  elements.reviewSummary.textContent = model.review?.summary ?? '';
  elements.reviewClarity.textContent = model.review?.clarity ?? '';
  elements.reviewPace.textContent = model.review?.pace ?? '';
  elements.reviewHesitations.textContent = model.review?.hesitations?.join('\n') ?? '';
  elements.reviewRecommendations.textContent = model.review?.recommendations?.join('\n') ?? '';
}
