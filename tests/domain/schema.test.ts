import { describe, it, expect } from 'bun:test';
import { migrateBatchVariables } from '../../src/lib/server/domain/schema';
import type { VariableSchemaItem } from '../../src/lib/server/domain/types';

const oldSchema: VariableSchemaItem[] = [
  { name: 'hydration', unit: '%', type: 'number' },
  { name: 'bulk', unit: 'h', type: 'number' }
];

describe('migrateBatchVariables', () => {
  it('adds new field as null', () => {
    const newSchema: VariableSchemaItem[] = [...oldSchema, { name: 'salt', unit: 'g', type: 'number' }];
    const out = migrateBatchVariables({ hydration: 72, bulk: 5 }, oldSchema, newSchema);
    expect(out).toEqual({ hydration: 72, bulk: 5, salt: null });
  });

  it('removes deleted field', () => {
    const newSchema: VariableSchemaItem[] = [{ name: 'hydration', unit: '%', type: 'number' }];
    const out = migrateBatchVariables({ hydration: 72, bulk: 5 }, oldSchema, newSchema);
    expect(out).toEqual({ hydration: 72 });
  });

  it('renames a field by index pairing', () => {
    const newSchema: VariableSchemaItem[] = [
      { name: 'hydration_pct', unit: '%', type: 'number' },
      { name: 'bulk', unit: 'h', type: 'number' }
    ];
    const out = migrateBatchVariables({ hydration: 72, bulk: 5 }, oldSchema, newSchema);
    expect(out).toEqual({ hydration_pct: 72, bulk: 5 });
  });
});
