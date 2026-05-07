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

const reqJSON = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

// Per-handler event-arg helpers: each handler's first param has a manually-narrowed
// shape (not SvelteKit's full RequestEvent), so we cast our test fixtures to match.
const evRecipesPOST = (o: { request: Request }) => o as Parameters<typeof recipesPOST>[0];
const evListGET = (o: { params: { id: string } }) => o as Parameters<typeof listGET>[0];
const evListPOST = (o: { params: { id: string }; request: Request }) => o as Parameters<typeof listPOST>[0];
const evPATCH = (o: { params: { id: string; batchId: string }; request: Request }) => o as Parameters<typeof onePATCH>[0];

describe('batches api', () => {
  it('creates root then child batch', async () => {
    await recipesPOST(evRecipesPOST({ request: reqJSON({ name: 'Sourdough', preset: 'bread', tags: [] }) }));
    const v1 = await (await listPOST(evListPOST({ params: { id: 'sourdough' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) }))).json();
    const v2 = await (await listPOST(evListPOST({ params: { id: 'sourdough' }, request: reqJSON({ label: 'tweak', parentIds: [v1.id], status: 'draft' }) }))).json();
    expect(v2.parentIds).toEqual([v1.id]);
    const all = await (await listGET(evListGET({ params: { id: 'sourdough' } }))).json();
    expect(all).toHaveLength(2);
  });

  it('rejects parent from a different recipe (409)', async () => {
    await recipesPOST(evRecipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) }));
    await expect(listPOST(evListPOST({ params: { id: 'a' }, request: reqJSON({ label: 'x', parentIds: ['ghost'], status: 'draft' }) })))
      .rejects.toMatchObject({ status: 409 });
  });

  it('PATCH to cooked auto-stamps cookedAt', async () => {
    await recipesPOST(evRecipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) }));
    const v1 = await (await listPOST(evListPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) }))).json();
    const updated = await (await onePATCH(evPATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'cooked' }), headers: { 'content-type': 'application/json' } }) }))).json();
    expect(updated.status).toBe('cooked');
    expect(updated.cookedAt).toBeTruthy();
  });

  it('rejects ingredient changes on a cooked batch (403)', async () => {
    await recipesPOST(evRecipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) }));
    const v1 = await (await listPOST(evListPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) }))).json();
    await onePATCH(evPATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'cooked' }), headers: { 'content-type': 'application/json' } }) }));

    await expect(
      onePATCH(evPATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ ingredients: [{ id: 'salt', name: 'salt', amount: '5', unit: 'g' }] }), headers: { 'content-type': 'application/json' } }) }))
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows outcomeNotes/rating patch on a cooked batch', async () => {
    await recipesPOST(evRecipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) }));
    const v1 = await (await listPOST(evListPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) }))).json();
    await onePATCH(evPATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'cooked' }), headers: { 'content-type': 'application/json' } }) }));

    const updated = await (await onePATCH(evPATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ outcomeNotes: 'great', rating: 5 }), headers: { 'content-type': 'application/json' } }) }))).json();
    expect(updated.outcomeNotes).toBe('great');
    expect(updated.rating).toBe(5);
  });

  it('rejects step.uses with unknown ingredientId (400)', async () => {
    await recipesPOST(evRecipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) }));
    const v1 = await (await listPOST(evListPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) }))).json();

    await expect(
      onePATCH(evPATCH({
        params: { id: 'a', batchId: v1.id },
        request: new Request('http://x', {
          method: 'PATCH',
          body: JSON.stringify({
            ingredients: [{ id: 'flour', name: 'flour', amount: '500', unit: 'g' }],
            steps: [{ text: 'mix', uses: [{ ingredientId: 'ghost', amount: 100 }] }]
          }),
          headers: { 'content-type': 'application/json' }
        })
      }))
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects DELETE when batch has children (409)', async () => {
    await recipesPOST(evRecipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) }));
    const v1 = await (await listPOST(evListPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) }))).json();
    await listPOST(evListPOST({ params: { id: 'a' }, request: reqJSON({ label: 'tweak', parentIds: [v1.id], status: 'draft' }) }));

    const { DELETE: oneDELETE } = await import('../../src/routes/api/recipes/[id]/batches/[batchId]/+server');
    const evDELETE = (o: { params: { id: string; batchId: string } }) => o as Parameters<typeof oneDELETE>[0];
    await expect(
      oneDELETE(evDELETE({ params: { id: 'a', batchId: v1.id } }))
    ).rejects.toMatchObject({ status: 409 });
  });

  it('clears recipe.currentBatchId when the deleted batch was current', async () => {
    await recipesPOST(evRecipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) }));
    const v1 = await (await listPOST(evListPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) }))).json();

    const { readRecipe } = await import('../../src/lib/server/storage/recipes');
    const before = await readRecipe('a');
    expect(before.currentBatchId).toBe(v1.id); // POST batch sets currentBatchId

    const { DELETE: oneDELETE } = await import('../../src/routes/api/recipes/[id]/batches/[batchId]/+server');
    const evDELETE = (o: { params: { id: string; batchId: string } }) => o as Parameters<typeof oneDELETE>[0];
    await oneDELETE(evDELETE({ params: { id: 'a', batchId: v1.id } }));

    const after = await readRecipe('a');
    expect(after.currentBatchId).toBe(null);
  });

  it('preserves currentBatchId when deleting a different batch', async () => {
    await recipesPOST(evRecipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) }));
    const v1 = await (await listPOST(evListPOST({ params: { id: 'a' }, request: reqJSON({ label: 'one', parentIds: [], status: 'draft' }) }))).json();
    const v2 = await (await listPOST(evListPOST({ params: { id: 'a' }, request: reqJSON({ label: 'two', parentIds: [], status: 'draft' }) }))).json();
    const { readRecipe } = await import('../../src/lib/server/storage/recipes');
    expect((await readRecipe('a')).currentBatchId).toBe(v2.id);

    const { DELETE: oneDELETE } = await import('../../src/routes/api/recipes/[id]/batches/[batchId]/+server');
    const evDELETE = (o: { params: { id: string; batchId: string } }) => o as Parameters<typeof oneDELETE>[0];
    await oneDELETE(evDELETE({ params: { id: 'a', batchId: v1.id } }));

    expect((await readRecipe('a')).currentBatchId).toBe(v2.id);
  });
});
