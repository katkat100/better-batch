import { rm, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

const DATA = './tests/e2e/.tmp-data';

export async function clearTestData(opts: { page?: Page } = {}): Promise<void> {
  await mkdir(DATA, { recursive: true });
  // Remove contents but keep the dir so concurrent in-flight writes don't ENOENT on rename.
  for (const entry of await readdir(DATA)) {
    await rm(join(DATA, entry), { recursive: true, force: true });
  }

  if (opts.page) {
    // Default: suppress welcome panel so existing tests aren't shadowed by it.
    // Welcome-panel tests opt back in by clearing this init script + key.
    // Using addInitScript so it runs before every page load, including the first goto
    // where page.evaluate would otherwise fail (no same-origin URL yet).
    await opts.page.addInitScript(() => {
      try {
        localStorage.setItem('bb_welcome_dismissed', '1');
      } catch {
        // Ignore — localStorage may not be available in some contexts.
      }
    });
    try {
      await opts.page.evaluate(() => indexedDB.deleteDatabase('better-batch'));
      await opts.page.evaluate(() => localStorage.clear());
    } catch {
      // Page may not be on a same-origin URL yet; ignore.
    }
  }
}
