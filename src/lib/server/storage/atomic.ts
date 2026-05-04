import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, contents, 'utf8');
  await rename(tmp, path);
}
