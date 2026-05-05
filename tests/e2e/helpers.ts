import { rm } from 'node:fs/promises';

export async function clearTestData() {
  await rm('./tests/e2e/.tmp-data', { recursive: true, force: true });
}
