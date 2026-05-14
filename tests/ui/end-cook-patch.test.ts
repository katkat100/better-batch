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

  it('first-cook with multiplier > 1 sets cookMultiplier and does not prepend a text marker', () => {
    const patch = buildEndCookPatch({
      mode: 'first-cook',
      startedAt: 1_000,
      endedAt: 61_000,
      outcomeNotes: 'great crumb',
      rating: 4,
      existingOutcomeNotes: '',
      multiplier: 2,
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch.outcomeNotes).toBe('great crumb');
    expect(patch.cookMultiplier).toBe(2);
  });

  it('first-cook with no user notes and multiplier > 1 saves empty notes but sets cookMultiplier', () => {
    const patch = buildEndCookPatch({
      mode: 'first-cook',
      startedAt: 0,
      endedAt: 0,
      outcomeNotes: '',
      rating: null,
      existingOutcomeNotes: '',
      multiplier: 3,
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch.outcomeNotes).toBe('');
    expect(patch.cookMultiplier).toBe(3);
  });

  it('first-cook at multiplier 1 sends cookMultiplier: 1 on the patch (storage drops)', () => {
    const patch = buildEndCookPatch({
      mode: 'first-cook',
      startedAt: 0,
      endedAt: 0,
      outcomeNotes: 'great crumb',
      rating: null,
      existingOutcomeNotes: '',
      multiplier: 1,
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch.outcomeNotes).toBe('great crumb');
    expect(patch.cookMultiplier).toBe(1);
  });

  it('re-cook with multiplier > 1 keeps the text marker AND sets cookMultiplier', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: 'darker than v1',
      rating: null,
      existingOutcomeNotes: 'first cook: nice',
      multiplier: 2,
      now: new Date('2026-06-01T12:00:00Z')
    });
    expect(patch.outcomeNotes).toBe('first cook: nice\n\n— 2026-06-01:\nCooked at 2x\ndarker than v1');
    expect(patch.cookMultiplier).toBe(2);
  });

  it('re-cook with no user notes + multiplier > 1 keeps marker block AND sets cookMultiplier', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: '   ',
      rating: null,
      existingOutcomeNotes: 'first cook: nice',
      multiplier: 3,
      now: new Date('2026-06-01T12:00:00Z')
    });
    expect(patch.outcomeNotes).toBe('first cook: nice\n\n— 2026-06-01:\nCooked at 3x');
    expect(patch.cookMultiplier).toBe(3);
  });

  it('re-cook at multiplier 1 with no user notes still sends cookMultiplier: 1 so storage clears any prior value', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: '   ',
      rating: null,
      existingOutcomeNotes: 'prior',
      multiplier: 1,
      now: new Date()
    });
    // outcomeNotes patch is absent (no marker, no user notes) — same as before.
    expect(patch.outcomeNotes).toBeUndefined();
    // cookMultiplier rides along so the storage drop rule clears any prior value.
    expect(patch.cookMultiplier).toBe(1);
  });
});
