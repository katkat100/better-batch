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
  // The multiplier always rides along on the patch when an end-cook submit
  // happens. Storage drops values <= 1, so callers don't need to think about
  // the persist/drop boundary themselves.
  const multiplierField = state.multiplier !== undefined
    ? { cookMultiplier: state.multiplier }
    : {};

  if (state.mode === 'first-cook') {
    // First-cook used to prepend "Cooked at Nx" to outcomeNotes; now the
    // structured cookMultiplier field is the source of truth and the badge
    // replaces the text marker.
    return {
      status: 'cooked',
      cookedAt: now.toISOString(),
      outcomeNotes: trimmed,
      rating: state.rating,
      cookDurationMs: state.endedAt - state.startedAt,
      ...multiplierField
    };
  }

  // re-cook: write a date-headed block when there's anything to record
  // (user notes OR a multiplier marker). Marker stays in the notes for
  // per-session history.
  if (!trimmed && !marker) {
    // Nothing to write into outcomeNotes, but still update cookMultiplier
    // so a re-cook at 1x clears a prior 2x badge.
    return multiplierField;
  }

  const dateLabel = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const headerBody = marker && trimmed
    ? `${marker}\n${trimmed}`
    : (marker || trimmed);
  const header = `— ${dateLabel}:\n${headerBody}`;
  const next = state.existingOutcomeNotes
    ? `${state.existingOutcomeNotes}\n\n${header}`
    : header;
  return { outcomeNotes: next, ...multiplierField };
}
