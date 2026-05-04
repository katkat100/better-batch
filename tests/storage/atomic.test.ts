import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileAtomic } from '../../src/lib/server/storage/atomic';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bb-atomic-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('writeFileAtomic', () => {
  it('writes the contents to the target path', async () => {
    const path = join(dir, 'a.json');
    await writeFileAtomic(path, '{"x":1}');
    expect(await readFile(path, 'utf8')).toBe('{"x":1}');
  });

  it('leaves no temp files behind on success', async () => {
    const path = join(dir, 'b.json');
    await writeFileAtomic(path, 'hello');
    const files = await readdir(dir);
    expect(files).toEqual(['b.json']);
  });

  it('creates parent directories if missing', async () => {
    const path = join(dir, 'nested/deep/file.json');
    await writeFileAtomic(path, 'ok');
    expect(await readFile(path, 'utf8')).toBe('ok');
  });
});
