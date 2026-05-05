import { describe, it, expect } from 'bun:test';
import { buildEndCookPatch } from '../../src/lib/ui/cook/layout/end-cook-patch';

describe('buildEndCookPatch', () => {
  it('first-cook returns full transition payload', () => {
    const patch = buildEndCookPatch({
      mode: 'first-cook',
      startedAt: 1_000,
      endedAt: 61_000,
      outcomeNotes: 'great crumb',
      rating: 4,
      existingOutcomeNotes: '',
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch).toEqual({
      status: 'cooked',
      cookedAt: '2026-05-15T18:30:00.000Z',
      outcomeNotes: 'great crumb',
      rating: 4,
      cookDurationMs: 60_000
    });
  });

  it('re-cook appends timestamped note to existing outcomeNotes', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 1_000,
      endedAt: 100_000,
      outcomeNotes: 'higher temp made it darker',
      rating: null,
      existingOutcomeNotes: 'first cook: nice',
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch).toEqual({
      outcomeNotes: 'first cook: nice\n\n— 2026-05-15:\nhigher temp made it darker'
    });
  });

  it('re-cook with empty notes is a no-op patch (empty object)', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: '   ',
      rating: null,
      existingOutcomeNotes: 'prior',
      now: new Date()
    });
    expect(patch).toEqual({});
  });

  it('re-cook with empty existing notes still appends a header', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: 'second time around',
      rating: null,
      existingOutcomeNotes: '',
      now: new Date('2026-06-01T12:00:00Z')
    });
    expect(patch.outcomeNotes).toBe('— 2026-06-01:\nsecond time around');
  });
});
