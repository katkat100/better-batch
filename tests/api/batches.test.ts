import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDataDirForTest, clearDataDirCache } from '../../src/lib/server/storage/paths';
import { POST as recipesPOST } from '../../src/routes/api/recipes/+server';
import { GET as listGET, POST as listPOST } from '../../src/routes/api/recipes/[id]/batches/+server';
import { PATCH as onePATCH } from '../../src/routes/api/recipes/[id]/batches/[batchId]/+server';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bb-api-b-')); setDataDirForTest(dir); });
afterEach(async () => { clearDataDirCache(); await rm(dir, { recursive: true, force: true }); });

const reqJSON = (body: any) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('batches api', () => {
  it('creates root then child batch', async () => {
    await recipesPOST({ request: reqJSON({ name: 'Sourdough', preset: 'bread', tags: [] }) } as any);
    const v1 = await (await listPOST({ params: { id: 'sourdough' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) } as any)).json();
    const v2 = await (await listPOST({ params: { id: 'sourdough' }, request: reqJSON({ label: 'tweak', parentIds: [v1.id], status: 'draft' }) } as any)).json();
    expect(v2.parentIds).toEqual([v1.id]);
    const all = await (await listGET({ params: { id: 'sourdough' } } as any)).json();
    expect(all).toHaveLength(2);
  });

  it('rejects parent from a different recipe (409)', async () => {
    await recipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) } as any);
    await expect(listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'x', parentIds: ['ghost'], status: 'draft' }) } as any))
      .rejects.toMatchObject({ status: 409 });
  });

  it('PATCH to cooked auto-stamps cookedAt', async () => {
    await recipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) } as any);
    const v1 = await (await listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) } as any)).json();
    const updated = await (await onePATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'cooked' }), headers: { 'content-type': 'application/json' } }) } as any)).json();
    expect(updated.status).toBe('cooked');
    expect(updated.cookedAt).toBeTruthy();
  });
});
