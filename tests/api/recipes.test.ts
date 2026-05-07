import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDataDirForTest, clearDataDirCache } from '../../src/lib/server/storage/paths';
import { GET as listGET, POST as listPOST } from '../../src/routes/api/recipes/+server';
import { GET as oneGET, DELETE as oneDELETE } from '../../src/routes/api/recipes/[id]/+server';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bb-api-r-')); setDataDirForTest(dir); });
afterEach(async () => { clearDataDirCache(); await rm(dir, { recursive: true, force: true }); });

const reqJSON = (body: any) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('recipes api', () => {
  it('POST creates, GET lists', async () => {
    const created = await (await listPOST({ request: reqJSON({ name: 'Sourdough', preset: 'bread', tags: [] }) } as any)).json();
    expect(created.id).toBe('sourdough');
    const list = await (await listGET()).json();
    expect(list.map((r: any) => r.id)).toEqual(['sourdough']);
  });

  it('GET /[id] returns 404 for missing', async () => {
    await expect(oneGET({ params: { id: 'missing' } } as any)).rejects.toMatchObject({ status: 404 });
  });

  it('DELETE removes the recipe', async () => {
    await listPOST({ request: reqJSON({ name: 'X', preset: 'custom', tags: [] }) } as any);
    await oneDELETE({ params: { id: 'x' } } as any);
    const list = await (await listGET()).json();
    expect(list).toEqual([]);
  });
});
