import type { Ingredient, Step, VariableValue } from '$lib/server';
import type { DockTimer } from './CookTimerDock.svelte';

export interface CookSessionV1 {
  v: 1;
  recipeId: string;
  batchId: string;
  draft: {
    label: string;
    variables: Record<string, VariableValue>;
    ingredients: Ingredient[];
    steps: Step[];
  };
  started: boolean;
  startedAt: number | null;
  checkedSteps: number[];
  quickNotes: string[];
  multiplier: number;
  timers: DockTimer[];
}

function sessionKey(recipeId: string, batchId: string): string {
  return `bb:cook:v1:${recipeId}:${batchId}`;
}

export function saveSession(session: CookSessionV1, store: Storage = globalThis.localStorage): void {
  try {
    store.setItem(sessionKey(session.recipeId, session.batchId), JSON.stringify(session));
  } catch {
    // Best-effort: quota exceeded or storage unavailable. Cook continues in memory.
  }
}

export function loadSession(
  recipeId: string,
  batchId: string,
  store: Storage = globalThis.localStorage
): CookSessionV1 | null {
  let raw: string | null;
  try {
    raw = store.getItem(sessionKey(recipeId, batchId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CookSessionV1;
    if (parsed?.v !== 1 || parsed.recipeId !== recipeId || parsed.batchId !== batchId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(
  recipeId: string,
  batchId: string,
  store: Storage = globalThis.localStorage
): void {
  try {
    store.removeItem(sessionKey(recipeId, batchId));
  } catch {
    // ignore
  }
}
