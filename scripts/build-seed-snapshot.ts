import { writeFile, mkdir } from 'node:fs/promises';
import { listRecipes, listBatches, readIndex } from '../src/lib/server';

const recipes = await listRecipes();
const batches = (await Promise.all(
  recipes.map(r => listBatches(r.id))
)).flat();
let index;
try {
  index = await readIndex();
} catch {
  index = [];
}

await mkdir('static/seed', { recursive: true });
await writeFile(
  'static/seed/snapshot.json',
  JSON.stringify({ recipes, batches, index })
);
console.log(`Wrote seed snapshot: ${recipes.length} recipes, ${batches.length} batches`);
