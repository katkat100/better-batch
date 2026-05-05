export type VariableType = 'number' | 'text';

export interface VariableSchemaItem {
  name: string;
  unit: string;        // e.g. "%", "°F", "g", "" (empty allowed)
  type: VariableType;
}

export type VariableValue = number | string | null;

export type RecipePreset = 'bread' | 'sauce' | 'braise' | 'custom';

export interface Recipe {
  id: string;                       // slug
  name: string;
  description: string;
  tags: string[];
  preset: RecipePreset;
  variableSchema: VariableSchemaItem[];
  currentBatchId: string | null;
  createdAt: string;                // ISO 8601
  updatedAt: string;
}

export type BatchStatus = 'draft' | 'cooked' | 'archived';

export interface Ingredient {
  id: string;
  name: string;
  amount: string;                   // free text, e.g. "500" or "1/2"
  unit: string;                     // e.g. "g", "tsp"
  section?: string;
}

export interface IngredientUse {
  ingredientId: string;
  amount: number;
}

export interface Step {
  text: string;
  uses: IngredientUse[];
}

export interface Batch {
  id: string;                       // slug like "v3-longer-bulk"
  recipeId: string;
  label: string;
  parentIds: string[];              // 0 = root, 1 = normal, 2 = merge
  status: BatchStatus;
  cookedAt: string | null;
  cookDurationMs?: number;               // ms elapsed during first-cook session
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
  outcomeNotes: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  createdAt: string;
}

export interface IndexEntry {
  id: string;
  name: string;
  tags: string[];
  preset: RecipePreset;
  batchCount: number;
  lastCookedAt: string | null;
  sparklineVariable: string | null;       // schema item name, or null
  sparklineValues: (number | null)[];     // chronological, only if numeric
}
