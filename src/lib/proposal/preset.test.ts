import { describe, expect, test } from 'vitest';
import { effectiveAnswers, planProposal, proposalSchema } from './preset';

const P = proposalSchema.parse({
  blocks: {
    portada: { module: 'portada', props: { title: 'D' } }, problema: { module: 'problema', props: { title: 'Hoy' } },
    privados: { module: 'problema', props: { title: 'Privados' } }, pantalla: { module: 'pantalla', props: { scenes: ['promo', 'foto'] } },
    gente: { module: 'movil' }, sala: { module: 'movil' }, mesas: { module: 'tabs' }, dj: { module: 'tabs' },
    caso: { module: 'caso' }, precio: { module: 'precio' },
  },
  modes: { full: ['portada', 'problema', 'pantalla', 'gente', 'sala', 'caso', 'precio'], visual: ['pantalla', 'gente', 'sala', 'precio'] },
  max: { full: 8, visual: 5 },
  priority: ['portada', 'problema', 'pantalla', 'gente', 'sala', 'precio', 'dj', 'mesas', 'caso'],
  choices: [
    { key: 'tipo', label: 'Tipo', default: 'estandar', options: [
      { key: 'estandar', label: 'Estándar' },
      { key: 'privados', label: 'Privados', rules: [{ replace: 'problema', with: 'privados' }] },
    ] },
    { key: 'angulo', label: 'Ángulo', default: 'd', when: ['tipo:estandar'], options: [
      { key: 'a', label: 'Líder', rules: [{ patch: 'portada', set: { title: 'A' } }], priority: ['portada', 'problema', 'pantalla', 'gente', 'sala', 'precio', 'caso', 'dj', 'mesas'] },
      { key: 'd', label: 'Marca' },
    ] },
  ],
  questions: [
    { key: 'dj', label: '¿DJ?', rules: [{ add: 'dj', after: 'sala' }] },
    { key: 'mesas', label: '¿Mesas?', rules: [{ add: 'mesas', after: ['dj', 'sala'] }] },
    { key: 'vj', label: '¿VJ?', rules: [{ insert: 'pantalla', into: 'scenes', at: 1, value: 'visuales' }] },
    { key: 'oficina', label: '¿Oficina?', when: ['tipo:estandar'], rules: [{ patch: 'portada', set: { sub: 'oficina' } }, { patch: 'problema', set: { note: 'solo D' }, when: 'angulo:d' }] },
  ],
});
const keys = (b: Array<{ block: string }>) => b.map((x) => x.block);
const props = (b: Array<{ block: string; props: Record<string, unknown> }>, k: string) => b.find((x) => x.block === k)?.props;

describe('propuesta por sector', () => {
  test('por defecto: tipo estándar y ángulo D', () => {
    expect(effectiveAnswers(P, [])).toEqual(['tipo:estandar', 'angulo:d']);
    expect(keys(planProposal(P, 'full', []))).toEqual(['portada', 'problema', 'pantalla', 'gente', 'sala', 'caso', 'precio']);
  });
  test('un ángulo y no se mezclan; un tipo sin ángulo lo ignora', () => {
    expect(props(planProposal(P, 'full', ['angulo:a']), 'portada')).toEqual({ title: 'A' });
    const priv = planProposal(P, 'full', ['tipo:privados', 'angulo:a', 'oficina']);
    expect(keys(priv)).toContain('privados');
    expect(props(priv, 'portada')).toEqual({ title: 'D' });  // sin ángulo ni «oficina» (no aplican)
    expect(effectiveAnswers(P, ['tipo:privados', 'angulo:a', 'oficina'])).toEqual(['tipo:privados']);
  });
  test('añadir con anclas alternativas, meter en una lista, reglas condicionadas', () => {
    const r = planProposal(P, 'full', ['mesas', 'vj', 'oficina']);
    expect(keys(r)).toEqual(['portada', 'problema', 'pantalla', 'gente', 'sala', 'mesas', 'caso', 'precio']);
    expect(props(r, 'pantalla')).toEqual({ scenes: ['promo', 'visuales', 'foto'] });
    expect(props(r, 'problema')).toEqual({ title: 'Hoy', note: 'solo D' });
    expect(props(planProposal(P, 'full', ['oficina', 'angulo:a']), 'problema')).toEqual({ title: 'Hoy' });
  });
  test('tope: lo que no cabe sale por prioridad (el caso el primero), sin comprimir', () => {
    const r = planProposal(P, 'full', ['dj', 'mesas']);
    expect(keys(r)).toEqual(['portada', 'problema', 'pantalla', 'gente', 'sala', 'dj', 'mesas', 'precio']);
    expect(keys(planProposal(P, 'visual', ['dj', 'mesas']))).toEqual(['pantalla', 'gente', 'sala', 'dj', 'precio']);
  });
  test('una opción con orden propio cambia lo que se recorta (el condicional antes que el caso)', () => {
    expect(keys(planProposal(P, 'full', ['angulo:a', 'dj', 'mesas']))).toEqual(['portada', 'problema', 'pantalla', 'gente', 'sala', 'dj', 'caso', 'precio']);
  });
  test('una regla que apunta a un bloque inexistente no pasa la validación', () => {
    expect(proposalSchema.safeParse({ blocks: { a: { module: 'x' } }, modes: { full: ['a', 'b'] } }).success).toBe(false);
  });
});
