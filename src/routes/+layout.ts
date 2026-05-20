import { browser } from '$app/environment';
import { seedIfEmpty } from '$lib/data/seed-import';

export const load = async () => {
  if (browser) await seedIfEmpty();
  return {};
};
