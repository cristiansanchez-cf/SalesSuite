import { describe, expect, test } from 'vitest';
import { planProposal, proposalSchema } from './preset';

const P = proposalSchema.parse({
  blocks: {
    portada: { module: 'portada' }, problema: { module: 'problema', props: { title: 'Hoy' } }, pantalla: { module: 'pantalla' },
    movil: { module: 'movil' }, dinamicas: { module: 'tabs' }, mesas: { module: 'tabs', props: { title: 'Mesas' } },
    dj: { module: 'tabs', props: { title: 'DJ' } }, precio: { module: 'precio' },
  },
  modes: { full: ['portada', 'problema', 'pantalla', 'movil', 'precio'], visual: ['pantalla', 'movil', 'dinamicas', 'precio'] },
  questions: [
    { key: 'dj', label: '¿DJ?', rules: [{ add: 'dj', after: 'movil' }] },
    { key: 'mesas', label: '¿Mesas?', rules: [{ replace: 'dinamicas', with: 'mesas' }, { add: 'mesas', before: 'precio' }] },
    { key: 'sin-pantalla', label: '¿Sin pantalla?', rules: [{ remove: 'pantalla' }] },
    { key: 'flojas', label: '¿Noches flojas?', rules: [{ patch: 'problema', set: { note: 'Con quince personas…' } }] },
  ],
});
const keys = (b: Array<{ block: string }>) => b.map((x) => x.block);

describe('propuesta por sector', () => {
  test('modo argumentario por defecto y apoyo visual', () => {
    expect(keys(planProposal(P, 'full', []))).toEqual(['portada', 'problema', 'pantalla', 'movil', 'precio']);
    expect(keys(planProposal(P, 'visual', []))).toEqual(['pantalla', 'movil', 'dinamicas', 'precio']);
  });
  test('añadir después de, cambiar, quitar y retocar textos', () => {
    const r = planProposal(P, 'full', ['dj', 'mesas', 'sin-pantalla', 'flojas']);
    expect(keys(r)).toEqual(['portada', 'problema', 'movil', 'dj', 'mesas', 'precio']);
    expect(r.find((b) => b.block === 'problema')?.props).toEqual({ title: 'Hoy', note: 'Con quince personas…' });
    // En apoyo visual «mesas» sustituye a las dinámicas (no se duplica).
    expect(keys(planProposal(P, 'visual', ['mesas']))).toEqual(['pantalla', 'movil', 'mesas', 'precio']);
  });
  test('una regla que apunta a un bloque inexistente no pasa la validación', () => {
    expect(proposalSchema.safeParse({ blocks: { a: { module: 'x' } }, modes: { full: ['a', 'b'] } }).success).toBe(false);
  });
});
