import type { Ingredient, Step, VariableSchemaItem, VariableValue } from '$lib/server';
import { parseAmount } from '$lib/ui/layout/amount-parse';

export interface PasteParseResult {
  ingredients: Ingredient[];
  steps: Step[];
  variables: Record<string, VariableValue>;
  unmatchedLines: string[];
}

const SECTION_RE = /^(ingredients|steps|method|directions|instructions)\s*:?\s*$/i;
const STEP_NUMBER_RE = /^(?:step\s+)?(\d+)\s*[.:)]\s*(.*)$/i;
const BULLET_RE = /^[-*•–]\s+/;
const VARIABLE_RE = /^([^:=\-–—]+?)\s*[:=\-–—]\s*(.+)$/;
const UNITS = [
  'g', 'kg', 'mg',
  'ml', 'l',
  'oz', 'lb', 'lbs',
  'cup', 'cups',
  'tsp', 'tbsp',
  'tablespoon', 'tablespoons',
  'teaspoon', 'teaspoons'
];
const UNIT_RE = new RegExp(`^(${UNITS.join('|')})\\b`, 'i');
const AMOUNT_PREFIX_RE = /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+\.?\d*))/;

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, '');
}

type Region = 'preamble' | 'ingredients' | 'steps';

function detectRegionSwitch(line: string): Region | null {
  const m = line.match(SECTION_RE);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  if (tag === 'ingredients') return 'ingredients';
  return 'steps';
}

function tryParseIngredient(rawLine: string): Ingredient | null {
  const stripped = rawLine.replace(BULLET_RE, '').trim();
  if (!stripped) return null;
  const amtMatch = stripped.match(AMOUNT_PREFIX_RE);
  if (!amtMatch) {
    return { id: '', amount: '', unit: '', name: stripped };
  }
  const amount = amtMatch[1];
  let rest = stripped.slice(amount.length).trimStart();
  let unit = '';
  const unitMatch = rest.match(UNIT_RE);
  if (unitMatch) {
    unit = unitMatch[1];
    rest = rest.slice(unitMatch[0].length).trimStart();
  }
  const name = rest.trim();
  return { id: '', amount, unit, name };
}

function looksLikeIngredient(line: string): boolean {
  const stripped = line.replace(BULLET_RE, '').trim();
  if (!stripped) return false;
  if (BULLET_RE.test(line)) return true;
  return AMOUNT_PREFIX_RE.test(stripped);
}

function tryParseSectionHeader(line: string, nextLineLooksLikeIngredient: boolean): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (BULLET_RE.test(line)) return null;
  if (AMOUNT_PREFIX_RE.test(trimmed)) return null;
  if (trimmed.length >= 30) return null;
  if (!nextLineLooksLikeIngredient) return null;
  return trimmed;
}

function tryParseVariable(
  line: string,
  schema: VariableSchemaItem[]
): { name: string; value: VariableValue } | null {
  const m = line.match(VARIABLE_RE);
  if (!m) return null;
  const rawName = m[1].trim();
  const rawValue = m[2].trim();
  const norm = normalizeName(rawName);
  const schemaMatch = schema.find(s => normalizeName(s.name) === norm);
  if (!schemaMatch) return null;
  if (schemaMatch.type === 'number') {
    const numericPart = rawValue.match(/^(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+\.?\d*)/);
    if (!numericPart) return null;
    const n = parseAmount(numericPart[0]);
    if (n === null || !Number.isFinite(n)) return null;
    return { name: schemaMatch.name, value: n };
  }
  return { name: schemaMatch.name, value: rawValue };
}

export function parseRecipePaste(
  input: string,
  schema: VariableSchemaItem[]
): PasteParseResult {
  const lines = input.split(/\r?\n/);
  const result: PasteParseResult = {
    ingredients: [],
    steps: [],
    variables: {},
    unmatchedLines: []
  };

  const hasMarker = lines.some(l => detectRegionSwitch(l) !== null);

  let region: Region = 'preamble';
  let currentSection: string | undefined;
  let currentStep: Step | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    const switched = detectRegionSwitch(line);
    if (switched) {
      region = switched;
      currentSection = undefined;
      currentStep = null;
      continue;
    }

    if (region === 'preamble') {
      const varMatch = tryParseVariable(line, schema);
      if (varMatch) {
        result.variables[varMatch.name] = varMatch.value;
      } else if (line.match(VARIABLE_RE)) {
        result.unmatchedLines.push(line);
      } else if (!hasMarker) {
        if (looksLikeIngredient(raw)) {
          const ing = tryParseIngredient(raw);
          if (ing) result.ingredients.push(ing);
        } else {
          result.steps.push({ text: line, uses: [] });
        }
      } else {
        result.unmatchedLines.push(line);
      }
      continue;
    }

    if (region === 'ingredients') {
      const nextLooksIngredient =
        i + 1 < lines.length && looksLikeIngredient(lines[i + 1]);
      const sec = tryParseSectionHeader(raw, nextLooksIngredient);
      if (sec) {
        currentSection = sec;
        continue;
      }
      const ing = tryParseIngredient(raw);
      if (ing) {
        if (currentSection) ing.section = currentSection;
        result.ingredients.push(ing);
      } else {
        result.unmatchedLines.push(line);
      }
      continue;
    }

    if (region === 'steps') {
      const numMatch = line.match(STEP_NUMBER_RE);
      if (numMatch) {
        currentStep = { text: numMatch[2].trim(), uses: [] };
        result.steps.push(currentStep);
      } else if (currentStep) {
        currentStep.text = (currentStep.text + ' ' + line).trim();
      } else {
        result.steps.push({ text: line, uses: [] });
      }
    }
  }

  return result;
}
