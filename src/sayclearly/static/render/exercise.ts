import { type AppModel } from '../app_state.js';
import { type ShellElements } from '../dom_elements.js';

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

export function renderExercise(
  elements: ShellElements,
  model: AppModel,
  hasExercise: boolean,
  showRecordingControls: boolean,
): void {
  const generatedExercise = model.generated_exercise;

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

  if (!hasExercise || generatedExercise === null) {
    elements.stepLabel.textContent = STEP_CONTENT.step_1_slow.label;
    elements.stepTitle.textContent = STEP_CONTENT.step_1_slow.title;
    elements.stepInstruction.textContent = STEP_CONTENT.step_1_slow.instruction;
    elements.nextStepButton.textContent = STEP_CONTENT.step_1_slow.nextButtonLabel;
    elements.nextStepButton.disabled = STEP_CONTENT.step_1_slow.nextButtonDisabled;
    elements.nextStepButton.hidden = false;
    elements.exerciseText.textContent = EXERCISE_PLACEHOLDER;
    return;
  }

  const stepContent =
    STEP_CONTENT[model.flow as keyof typeof STEP_CONTENT] ?? STEP_CONTENT.step_1_slow;
  elements.stepLabel.textContent = stepContent.label;
  elements.stepTitle.textContent = stepContent.title;
  elements.stepInstruction.textContent = stepContent.instruction;
  elements.nextStepButton.textContent = stepContent.nextButtonLabel;
  elements.nextStepButton.disabled = stepContent.nextButtonDisabled;
  elements.nextStepButton.hidden = showRecordingControls;
  elements.exerciseText.textContent = generatedExercise.text;
}
