import type { Batch } from '$lib/server';

interface EndCookSessionState {
  mode: 'first-cook' | 're-cook';
  startedAt: number;
  endedAt: number;
  outcomeNotes: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  existingOutcomeNotes: string;
  multiplier?: number;  // optional for backward compatibility; default 1
  now?: Date;           // injectable for tests
}

function multiplierMarker(multiplier: number | undefined): string {
  if (!multiplier || multiplier === 1) return '';
  return `Cooked at ${multiplier}x`;
}

export function buildEndCookPatch(state: EndCookSessionState): Partial<Batch> {
  const now = state.now ?? new Date();
  const trimmed = state.outcomeNotes.trim();
  const marker = multiplierMarker(state.multiplier);

  if (state.mode === 'first-cook') {
    const outcomeNotes = marker && trimmed
      ? `${marker}\n\n${trimmed}`
      : (marker || trimmed);
    return {
      status: 'cooked',
      cookedAt: now.toISOString(),
      outcomeNotes,
      rating: state.rating,
      cookDurationMs: state.endedAt - state.startedAt
    };
  }

  // re-cook: write a date-headed block when there's anything to record
  // (user notes OR a multiplier marker).
  if (!trimmed && !marker) return {};

  const dateLabel = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const headerBody = marker && trimmed
    ? `${marker}\n${trimmed}`
    : (marker || trimmed);
  const header = `— ${dateLabel}:\n${headerBody}`;
  const next = state.existingOutcomeNotes
    ? `${state.existingOutcomeNotes}\n\n${header}`
    : header;
  return { outcomeNotes: next };
}
