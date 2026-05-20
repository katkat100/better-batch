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
    try {
      await opts.page.evaluate(() => indexedDB.deleteDatabase('better-batch'));
    } catch {
      // Page may not be on a same-origin URL yet; ignore.
    }
  }
}
