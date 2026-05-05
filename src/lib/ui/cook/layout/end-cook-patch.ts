import type { Batch } from '$lib/server';

export interface EndCookSessionState {
  mode: 'first-cook' | 're-cook';
  startedAt: number;
  endedAt: number;
  outcomeNotes: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  existingOutcomeNotes: string;
  now?: Date;  // injectable for tests
}

export function buildEndCookPatch(state: EndCookSessionState): Partial<Batch> {
  const now = state.now ?? new Date();
  const trimmed = state.outcomeNotes.trim();

  if (state.mode === 'first-cook') {
    return {
      status: 'cooked',
      cookedAt: now.toISOString(),
      outcomeNotes: trimmed,
      rating: state.rating,
      cookDurationMs: state.endedAt - state.startedAt
    };
  }

  // re-cook: only patch outcomeNotes if user actually wrote something
  if (!trimmed) return {};

  const dateLabel = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const header = `— ${dateLabel}:\n${trimmed}`;
  const next = state.existingOutcomeNotes
    ? `${state.existingOutcomeNotes}\n\n${header}`
    : header;
  return { outcomeNotes: next };
}
