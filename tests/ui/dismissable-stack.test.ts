import { describe, it, expect, beforeEach } from 'bun:test';
import { get } from 'svelte/store';
import { register, popTop, stackDepth } from '../../src/lib/ui/dismissable-stack';

beforeEach(() => {
  // Drain the stack between tests.
  while (popTop()) {
    /* noop */
  }
});

describe('dismissable stack', () => {
  it('starts empty', () => {
    expect(get(stackDepth)).toBe(0);
    expect(popTop()).toBe(false);
  });

  it('registers a dismiss fn and pops it', () => {
    let dismissed = false;
    register(() => { dismissed = true; });
    expect(get(stackDepth)).toBe(1);
    expect(popTop()).toBe(true);
    expect(dismissed).toBe(true);
    expect(get(stackDepth)).toBe(0);
  });

  it('pops in LIFO order', () => {
    const calls: string[] = [];
    register(() => calls.push('a'));
    register(() => calls.push('b'));
    register(() => calls.push('c'));
    popTop();
    popTop();
    popTop();
    expect(calls).toEqual(['c', 'b', 'a']);
  });

  it('cleanup removes a registered fn from the middle of the stack', () => {
    const calls: string[] = [];
    register(() => calls.push('a'));
    const cleanupB = register(() => calls.push('b'));
    register(() => calls.push('c'));
    cleanupB();
    expect(get(stackDepth)).toBe(2);
    popTop();
    popTop();
    expect(calls).toEqual(['c', 'a']);
  });

  it('cleanup is idempotent', () => {
    const cleanup = register(() => {});
    cleanup();
    cleanup();
    expect(get(stackDepth)).toBe(0);
  });

  it('popTop returns false on empty stack', () => {
    expect(popTop()).toBe(false);
  });
});
