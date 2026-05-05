import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmp, contents, 'utf8');
  await rename(tmp, path);
}
