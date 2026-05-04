import type { VariableSchemaItem, VariableValue } from './types';

/**
 * Migrate a batch's variables map from oldSchema to newSchema.
 * Pairing rule: if oldSchema[i] and newSchema[i] differ only in name (same type), value carries over (rename).
 * Otherwise: matching by name across both schemas; new names start as null; missing names drop.
 */
export function migrateBatchVariables(
  current: Record<string, VariableValue>,
  oldSchema: VariableSchemaItem[],
  newSchema: VariableSchemaItem[]
): Record<string, VariableValue> {
  const out: Record<string, VariableValue> = {};
  // First pass: name-match
  const oldNames = new Set(oldSchema.map(s => s.name));
  for (const item of newSchema) {
    if (oldNames.has(item.name)) {
      out[item.name] = current[item.name] ?? null;
    } else {
      out[item.name] = null;
    }
  }
  // Second pass: index-paired renames (same position, different name, same type, was null in newSchema)
  for (let i = 0; i < Math.min(oldSchema.length, newSchema.length); i++) {
    const o = oldSchema[i], n = newSchema[i];
    if (o.name !== n.name && o.type === n.type && out[n.name] === null && current[o.name] !== undefined) {
      out[n.name] = current[o.name];
    }
  }
  return out;
}
