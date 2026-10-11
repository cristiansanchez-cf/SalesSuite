/** Las herramientas estrictas de la API admiten como mucho 16 parámetros con tipos unión: si se pasa, la IA da 400. */
import { describe, expect, test } from 'vitest';
import { CLEANUP_TOOL } from './cleanup';
import { NOTES_TOOL } from './notes';
import { SAVE_TOOL } from './research';
import { FIXES_TOOL, PLACES_TOOL } from './zones-normalize';

function unions(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce((n, x) => n + unions(x), 0);
  const o = node as Record<string, unknown>;
  const own = Array.isArray(o.type) || Array.isArray(o.anyOf) ? 1 : 0;
  return own + Object.entries(o).reduce((n, [k, v]) => n + (k === 'type' ? 0 : unions(v)), 0);
}

describe('herramientas estrictas', () => {
  for (const [name, tool] of Object.entries({ CLEANUP_TOOL, NOTES_TOOL, SAVE_TOOL, FIXES_TOOL, PLACES_TOOL })) {
    test(`${name}: 16 uniones como mucho`, () => { expect(unions(tool.input_schema)).toBeLessThanOrEqual(16); });
  }
});
