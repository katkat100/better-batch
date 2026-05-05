import { rm, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const DATA = './tests/e2e/.tmp-data';

export async function clearTestData() {
  await mkdir(DATA, { recursive: true });
  // Remove contents but keep the dir so concurrent in-flight writes don't ENOENT on rename.
  for (const entry of await readdir(DATA)) {
    await rm(join(DATA, entry), { recursive: true, force: true });
  }
}
