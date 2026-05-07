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

const reqJSON = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

const evListPOST = (o: { request: Request }) => o as Parameters<typeof listPOST>[0];
const evOneGET = (o: { params: { id: string } }) => o as Parameters<typeof oneGET>[0];
const evOneDELETE = (o: { params: { id: string } }) => o as Parameters<typeof oneDELETE>[0];

describe('recipes api', () => {
  it('POST creates, GET lists', async () => {
    const created = await (await listPOST(evListPOST({ request: reqJSON({ name: 'Sourdough', preset: 'bread', tags: [] }) }))).json();
    expect(created.id).toBe('sourdough');
    const list = await (await listGET({} as Parameters<typeof listGET>[0])).json();
    expect(list.map((r: { id: string }) => r.id)).toEqual(['sourdough']);
  });

  it('GET /[id] returns 404 for missing', async () => {
    await expect(oneGET(evOneGET({ params: { id: 'missing' } }))).rejects.toMatchObject({ status: 404 });
  });

  it('DELETE removes the recipe', async () => {
    await listPOST(evListPOST({ request: reqJSON({ name: 'X', preset: 'custom', tags: [] }) }));
    await oneDELETE(evOneDELETE({ params: { id: 'x' } }));
    const list = await (await listGET({} as Parameters<typeof listGET>[0])).json();
    expect(list).toEqual([]);
  });
});
