import { type Hesitation } from '../app_state.js';

export function formatHesitation(hesitation: Hesitation): string {
  return `${hesitation.note} (${hesitation.start.toFixed(1)}s-${hesitation.end.toFixed(1)}s)`;
}

export function formatHesitations(hesitations: readonly Hesitation[] | undefined): string {
  if (!hesitations || hesitations.length === 0) {
    return '';
  }
  return hesitations.map(formatHesitation).join('\n');
}
