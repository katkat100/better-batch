import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Recipe, Batch, IndexEntry } from './types';

interface BetterBatchDB extends DBSchema {
  recipes: {
    key: string;
    value: Recipe;
  };
  batches: {
    key: string;
    value: Batch;
    indexes: { byRecipe: string };
  };
  index: {
    key: string;            // always 'singleton'
    value: IndexEntry[];
  };
}

const DB_NAME = 'better-batch';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<BetterBatchDB>> | null = null;

export function openDb(): Promise<IDBPDatabase<BetterBatchDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BetterBatchDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('recipes')) {
          db.createObjectStore('recipes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('batches')) {
          const batchStore = db.createObjectStore('batches', { keyPath: 'id' });
          batchStore.createIndex('byRecipe', 'recipeId', { unique: false });
        }
        if (!db.objectStoreNames.contains('index')) {
          db.createObjectStore('index');  // out-of-line keys, used with key 'singleton'
        }
      }
    });
  }
  return dbPromise;
}

/**
 * Reset the cached connection. Tests call this between cases so each one
 * gets a fresh in-memory IDB via fake-indexeddb's database reset.
 */
export function _resetDbForTests(): void {
  dbPromise = null;
}
