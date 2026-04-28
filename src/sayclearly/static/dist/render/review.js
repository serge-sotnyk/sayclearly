import { formatHesitations } from './hesitations.js';
export function renderReview(elements, model) {
    elements.reviewPanel.hidden = model.review === null;
    elements.reviewActions.hidden = model.flow !== 'review' || model.review === null;
    elements.reviewSummary.textContent = model.review?.summary ?? '';
    elements.reviewClarity.textContent = model.review?.clarity ?? '';
    elements.reviewPace.textContent = model.review?.pace ?? '';
    elements.reviewHesitations.textContent = formatHesitations(model.review?.hesitations);
    elements.reviewRecommendations.textContent = model.review?.recommendations?.join('\n') ?? '';
}
