import { describe, it, expect } from 'bun:test';
import { saveSession, loadSession, clearSession, type CookSessionV1 } from '../../../src/lib/ui/cook/cook-session';

function fakeStore(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  } as Storage;
}

const session: CookSessionV1 = {
  v: 1, recipeId: 'sourdough', batchId: 'v3',
  draft: { label: 'v3', variables: { hydration: 72 }, ingredients: [], steps: [{ text: 'Mix', uses: [] }] },
  started: true, startedAt: 1000, checkedSteps: [0], quickNotes: ['more salt'], multiplier: 2,
  timers: [{ id: 't1', stepIndex: 0, label: 'rest', durationMs: 1000, startedAt: 1000, pausedAt: null, pausedAccumMs: 0, finished: false }]
};

describe('cook-session', () => {
  it('round-trips a session', () => {
    const store = fakeStore();
    saveSession(session, store);
    expect(loadSession('sourdough', 'v3', store)).toEqual(session);
  });
  it('returns null when no session exists', () => {
    expect(loadSession('sourdough', 'v3', fakeStore())).toBeNull();
  });
  it('returns null on recipe/batch mismatch', () => {
    const store = fakeStore();
    saveSession(session, store);
    expect(loadSession('other', 'v3', store)).toBeNull();
  });
  it('returns null on corrupt JSON', () => {
    const store = fakeStore();
    store.setItem('bb:cook:v1:sourdough:v3', '{not json');
    expect(loadSession('sourdough', 'v3', store)).toBeNull();
  });
  it('clears a session', () => {
    const store = fakeStore();
    saveSession(session, store);
    clearSession('sourdough', 'v3', store);
    expect(loadSession('sourdough', 'v3', store)).toBeNull();
  });
});
