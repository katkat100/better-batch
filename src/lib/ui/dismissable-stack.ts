import { writable } from 'svelte/store';

type DismissFn = () => void;
const stack: DismissFn[] = [];

export const stackDepth = writable(0);

/**
 * Register a dismiss function. Returns a cleanup that removes it
 * from the stack. Designed to be called inside an `$effect` so the
 * effect's cleanup runs the deregister automatically.
 */
export function register(dismiss: DismissFn): () => void {
  stack.push(dismiss);
  stackDepth.set(stack.length);
  return () => {
    const i = stack.indexOf(dismiss);
    if (i >= 0) {
      stack.splice(i, 1);
      stackDepth.set(stack.length);
    }
  };
}

/**
 * Pop and invoke the topmost dismiss function. Returns true if a
 * layer was dismissed, false if the stack was empty.
 */
export function popTop(): boolean {
  const top = stack.pop();
  if (top) {
    stackDepth.set(stack.length);
    top();
    return true;
  }
  return false;
}
