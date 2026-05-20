// Bun test setup: register fake-indexeddb as the global IndexedDB
// implementation for any test file under tests/data/ that imports this module.
import 'fake-indexeddb/auto';
