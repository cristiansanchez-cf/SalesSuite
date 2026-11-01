import { describe, expect, test } from 'vitest';
import { effectiveAnswers, liteOf, parseProposal, planProposal, proposalSchema } from './preset';

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
  test('«learn»: cómo funciona contado al comercial, con UI conocida o sin ella', () => {
    const base = { blocks: { a: { module: 'x' } }, modes: { full: ['a'] } };
    expect(proposalSchema.safeParse({ ...base, learn: [{ title: 'Paso', body: 'Texto', ui: 'app:qr-scan' }, { title: 'Sin UI', body: 'Texto' }] }).success).toBe(true);
    expect(proposalSchema.safeParse({ ...base, learn: [{ title: 'Paso', body: 'Texto', ui: 'javascript:alert(1)' }] }).success).toBe(false);
  });
});

describe('propuesta por sector: casos límite', () => {
  test('planificar no toca la receta (se comparte entre peticiones) y da siempre lo mismo', () => {
    const before = JSON.stringify(P);
    const a = planProposal(P, 'full', ['angulo:a', 'vj', 'oficina', 'dj']);
    const b = planProposal(P, 'full', ['angulo:a', 'vj', 'oficina', 'dj']);
    expect(JSON.stringify(P)).toBe(before);
    expect(a).toEqual(b);
    // Los textos devueltos son copias: retocarlos no cambia la receta.
    (props(a, 'pantalla')!.scenes as string[]).push('otra');
    expect(P.blocks.pantalla.props.scenes).toEqual(['promo', 'foto']);
  });

  test('sin modo visual en la receta, «visual» usa el completo y su tope', () => {
    const r = proposalSchema.parse({ blocks: { a: { module: 'm' }, b: { module: 'm' }, c: { module: 'm' } }, modes: { full: ['a', 'b', 'c'] }, max: { full: 2 }, priority: ['c', 'a'] });
    expect(keys(planProposal(r, 'visual', []))).toEqual(['a', 'c']);
  });

  test('respuestas que no existen o con forma rara se ignoran (no rompen la propuesta)', () => {
    expect(effectiveAnswers(P, ['tipo:inventado', 'nada', 'angulo:', ':x'])).toEqual(['tipo:estandar', 'angulo:d']);
    expect(keys(planProposal(P, 'full', ['tipo:inventado', 'nada']))).toEqual(keys(planProposal(P, 'full', [])));
  });

  test('meter en una lista más allá del final la añade al final; en un texto que no es lista, crea la lista', () => {
    const r = proposalSchema.parse({
      blocks: { a: { module: 'm', props: { xs: ['1'], s: 'texto' } } }, modes: { full: ['a'] },
      questions: [{ key: 'q', label: 'Q', rules: [{ insert: 'a', into: 'xs', at: 20, value: 'fin' }, { insert: 'a', into: 's', at: 0, value: 'v' }] }],
    });
    expect(planProposal(r, 'full', ['q'])[0].props).toEqual({ xs: ['1', 'fin'], s: ['v'] });
  });

  test('recetas mal formadas: parseProposal devuelve null en vez de lanzar', () => {
    for (const raw of [null, undefined, 'x', 42, [], {}, { blocks: {} }, { blocks: { a: { module: 'm' } }, modes: { full: ['a'] }, extra: 1 },
      { blocks: { a: { module: 'm' } }, modes: { full: ['a'] }, choices: [{ key: 'c', label: 'C', default: 'z', options: [{ key: 'x', label: 'X' }, { key: 'y', label: 'Y' }] }] }]) {
      expect(parseProposal(raw)).toBeNull();
    }
    expect(parseProposal({ blocks: { a: { module: 'm' } }, modes: { full: ['a'] } })).not.toBeNull();
  });

  test('claves: solo minúsculas, cifras y guiones (nada que se pueda colar en un selector o una URL)', () => {
    for (const k of ['A', 'a b', 'a/b', '../a', 'a"', '-a', '']) {
      expect(proposalSchema.safeParse({ blocks: { [k]: { module: 'm' } }, modes: { full: [k] } }).success, k).toBe(false);
    }
  });

  test('liteOf: lo que necesita el editor, sin los textos de los bloques', () => {
    const l = liteOf(P)!;
    expect(l.hasVisual).toBe(true);
    expect(l.choices.map((c) => c.key)).toEqual(['tipo', 'angulo']);
    expect(JSON.stringify(l)).not.toContain('"Hoy"');   // ni los textos de los bloques ni sus reglas
    expect(JSON.stringify(l)).not.toContain('props');
    expect(JSON.stringify(l)).not.toContain('rules');
    expect(liteOf(null)).toBeNull();
  });
});
