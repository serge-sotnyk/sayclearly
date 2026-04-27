import { reuseTopic, startNewSession } from '../app_state.js';
export function createReviewFeature(ctx) {
    const { elements, state } = ctx;
    const handleNewSession = () => {
        ctx.clearRecordingArtifacts();
        state.model = startNewSession(state.model);
        ctx.rerender();
    };
    const handleReuseLatestTopic = () => {
        const topicPrompt = state.model.latest_session?.topic_prompt ?? '';
        if (topicPrompt === '') {
            return;
        }
        ctx.clearRecordingArtifacts();
        state.model = reuseTopic(state.model, topicPrompt);
        ctx.rerender();
    };
    const attachHandlers = () => {
        for (const button of elements.newSessionButtons) {
            button.addEventListener('click', handleNewSession);
        }
        elements.reviewReuseTopicButton.addEventListener('click', handleReuseLatestTopic);
    };
    return { attachHandlers };
}
