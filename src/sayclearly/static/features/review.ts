import { reuseTopic, startNewSession } from '../app_state.js';
import { type AppContext } from '../app_context.js';

export interface ReviewFeature {
  attachHandlers(): void;
}

export function createReviewFeature(ctx: AppContext): ReviewFeature {
  const { elements, state } = ctx;

  const handleNewSession = (): void => {
    ctx.clearRecordingArtifacts();
    state.model = startNewSession(state.model);
    ctx.rerender();
  };

  const handleReuseLatestTopic = (): void => {
    const topicPrompt = state.model.latest_session?.topic_prompt ?? '';
    if (topicPrompt === '') {
      return;
    }
    ctx.clearRecordingArtifacts();
    state.model = reuseTopic(state.model, topicPrompt);
    ctx.rerender();
  };

  const attachHandlers = (): void => {
    for (const button of elements.newSessionButtons) {
      button.addEventListener('click', handleNewSession);
    }
    elements.reviewReuseTopicButton.addEventListener('click', handleReuseLatestTopic);
  };

  return { attachHandlers };
}
