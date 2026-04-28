export function formatHesitation(hesitation) {
    return `${hesitation.note} (${hesitation.start.toFixed(1)}s-${hesitation.end.toFixed(1)}s)`;
}
export function formatHesitations(hesitations) {
    if (!hesitations || hesitations.length === 0) {
        return '';
    }
    return hesitations.map(formatHesitation).join('\n');
}
