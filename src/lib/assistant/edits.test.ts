import { describe, expect, test } from 'vitest';
import { cleanPlan, EDIT_HINT } from './edits';

describe('arreglar fichas con IA', () => {
  test('lo que vuelve, limpio: tipos del espacio, motivos conocidos, sin comillas, y nada vacío', () => {
    const p = cleanPlan({ is_edit: true, edits: [
      { target: '“Euforía y está en Murcia”', rename: '«Euforía»', place: 'Murcia', kind: null, discard: null, discard_why: null, restore: false, link_to: null, note: null },
      { target: 'Aula 212', rename: null, place: 'Torrejón de Ardoz', kind: 'promotora', discard: 'not_interested', discard_why: 'el local dijo que no', restore: true, link_to: 'La Facultad', note: 'Por Instagram les interesaba' },
      { target: 'X', rename: null, place: null, kind: 'inventado', discard: 'nada', discard_why: 'x', restore: false, link_to: null, note: null },
    ] }, ['company', 'promotora']);
    expect(p.isEdit).toBe(true);
    expect(p.edits).toHaveLength(2);
    expect(p.edits[0]).toMatchObject({ target: 'Euforía y está en Murcia', rename: 'Euforía', place: 'Murcia' });
    expect(p.edits[1]).toMatchObject({ kind: 'promotora', discard: 'not_interested', restore: false, linkTo: 'La Facultad' });
    expect(cleanPlan({ is_edit: true, edits: [] }, []).isEdit).toBe(false);
  });
  test('solo se llama a la IA si suena a arreglar fichas', () => {
    expect(EDIT_HINT.test('corrige el nombre de “Euforía y está en Murcia”. Se llama solo “Euforía”')).toBe(true);
    expect(EDIT_HINT.test('Aula 212 es una promotora, no un local')).toBe(true);
    expect(EDIT_HINT.test('descarta La Facultad')).toBe(true);
    expect(EDIT_HINT.test('He estado en Club Sol con Marta, les interesa')).toBe(false);
  });
});
