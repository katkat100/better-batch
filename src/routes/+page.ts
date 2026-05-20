import { browser } from '$app/environment';
import { readIndex } from '$lib/data/index-cache';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
  if (!browser) return { index: [] };
  const index = await readIndex();
  return { index };
};
