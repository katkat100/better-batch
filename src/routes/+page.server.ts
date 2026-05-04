import { readIndex, rebuildIndex } from '../lib/server';

export async function load() {
  let index = await readIndex();
  if (index.length === 0) index = await rebuildIndex();
  return { index };
}
