/**
 * Las recetas REALES de tenants/enjoy/tenant.json (market[].proposal) con planProposal: todas las combinaciones de
 * elecciones (tipo × ángulo × …), todas las combinaciones de preguntas y los dos modos (docs/PROPOSAL_PRESETS.md).
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { effectiveAnswers, planProposal, proposalSchema, PRESET_MODES, type Proposal, type PresetMode } from './preset';
import { REGISTRY, isBlockType } from '~/modules/registry';
import { deepMerge } from '~/modules/resolve';

const root = fileURLToPath(new URL('../../../', import.meta.url));
interface CatalogItem { key: string; block_type: string; props: Record<string, unknown> }
const tenant = JSON.parse(readFileSync(`${root}tenants/enjoy/tenant.json`, 'utf8')) as {
  catalog: CatalogItem[]; market: Array<{ key: string; name: string; proposal?: unknown }>;
};
const catalog = new Map(tenant.catalog.map((m) => [m.key, m]));
const toUrl = <T>(v: T): T => {
  if (typeof v === 'string' && v.startsWith('asset:')) return `https://cdn.test/enjoy/${v.slice(6)}` as T;
  if (Array.isArray(v)) return v.map(toUrl) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toUrl(x)])) as T;
  return v;
};
const assetRefs = (v: unknown): string[] =>
  typeof v === 'string' ? (v.startsWith('asset:') ? [v.slice(6)] : []) : Array.isArray(v) ? v.flatMap(assetRefs) : v && typeof v === 'object' ? Object.values(v).flatMap(assetRefs) : [];

/** Todas las respuestas posibles: producto de las opciones de cada elección × subconjuntos de preguntas. */
function* allAnswers(p: Proposal): Generator<string[]> {
  const choiceSets = p.choices.reduce<string[][]>((acc, ch) => acc.flatMap((a) => ch.options.map((o) => [...a, `${ch.key}:${o.key}`])), [[]]);
  const qs = p.questions.map((q) => q.key);
  for (const c of choiceSets) for (let m = 0; m < 1 << qs.length; m++) yield [...c, ...qs.filter((_, i) => m & (1 << i))];
}
/** Las combinaciones que de verdad son distintas (las que no aplican se quedan fuera: effectiveAnswers). */
const distinctCache = new Map<Proposal, string[][]>();
function distinctAnswers(p: Proposal): string[][] {
  if (!distinctCache.has(p)) {
    const seen = new Map<string, string[]>();
    for (const a of allAnswers(p)) { const e = effectiveAnswers(p, a); seen.set(e.join('|'), e); }
    distinctCache.set(p, [...seen.values()]);
  }
  return distinctCache.get(p)!;
}
const maxOf = (p: Proposal, mode: PresetMode) => p.max[mode] ?? (mode === 'visual' ? p.max.full : undefined);
const baseOf = (p: Proposal, mode: PresetMode) => (mode === 'visual' && p.modes.visual ? p.modes.visual : p.modes.full);
const keys = (b: Array<{ block: string }>) => b.map((x) => x.block);

/** Valida un bloque como el editor al montar (service.ts → resolveItem): props del módulo ⊕ textos del bloque. */
const validCache = new Map<string, string | null>();
function blockError(module: string, props: Record<string, unknown>): string | null {
  const k = module + JSON.stringify(props);
  if (validCache.has(k)) return validCache.get(k)!;
  const m = catalog.get(module)!;
  let err: string | null = null;
  if (!isBlockType(m.block_type)) err = `block_type desconocido ${m.block_type}`;
  else {
    const r = REGISTRY[m.block_type].schema.safeParse(deepMerge(toUrl(m.props), toUrl(props)));
    if (!r.success) err = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  validCache.set(k, err);
  return err;
}

const segments = tenant.market.filter((m) => m.proposal != null);

describe('recetas reales del espacio enjoy', () => {
  test('hay recetas (ocio nocturno, promotoras, conciertos, festivales, hoteles)', () => {
    expect(segments.map((s) => s.key)).toEqual(expect.arrayContaining(['ocio-nocturno', 'promotoras', 'conciertos', 'festivales', 'hoteles']));
  });

  for (const sg of segments) {
    describe(sg.name, () => {
      const parsed = proposalSchema.safeParse(sg.proposal);
      const p = parsed.data as Proposal;

      test('valida el schema zod de la receta', () => {
        expect(parsed.error?.issues ?? []).toEqual([]);
      });
      test('cada bloque apunta a un módulo del catálogo y los assets existen', () => {
        for (const [id, b] of Object.entries(p.blocks)) expect(catalog.has(b.module), `${id} → ${b.module}`).toBe(true);
        for (const r of assetRefs(sg.proposal)) expect(existsSync(`${root}tenants/enjoy/assets/${r}`), r).toBe(true);
      });
      test('las opciones por defecto existen y los `when` apuntan a respuestas que existen', () => {
        const all = new Set([...p.choices.flatMap((c) => c.options.map((o) => `${c.key}:${o.key}`)), ...p.questions.map((q) => q.key)]);
        for (const c of p.choices) for (const w of c.when ?? []) expect(all.has(w), `${c.key}.when ${w}`).toBe(true);
        for (const q of p.questions) for (const w of q.when ?? []) expect(all.has(w), `${q.key}.when ${w}`).toBe(true);
        const rules = [...p.choices.flatMap((c) => c.options.flatMap((o) => o.rules)), ...p.questions.flatMap((q) => q.rules)];
        for (const r of rules) if (r.when) expect(all.has(r.when), `regla when ${r.when}`).toBe(true);
      });

      test('todas las combinaciones × los dos modos: módulos del catálogo, sin duplicados, dentro del tope, en orden', () => {
        const errors: string[] = [];
        const fail = (cond: boolean, msg: string) => { if (!cond && errors.length < 10) errors.push(msg); };
        const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
        let n = 0;
        for (const answers of distinctAnswers(p)) {
          for (const mode of PRESET_MODES) {
            const plan = planProposal(p, mode, answers);
            const ks = keys(plan);
            const ctx = `${mode} [${answers.join(', ')}] → ${ks.join(', ')}`;
            n++;
            fail(plan.length > 0, `vacía: ${ctx}`);
            fail(new Set(ks).size === ks.length, `duplicados: ${ctx}`);
            for (const b of plan) {
              fail(!!p.blocks[b.block] && b.module === p.blocks[b.block].module, `bloque ${b.block} desconocido: ${ctx}`);
              fail(catalog.has(b.module), `módulo ${b.module} fuera del catálogo: ${ctx}`);
            }
            const max = maxOf(p, mode);
            fail(!max || plan.length <= max, `pasa del tope ${max}: ${ctx}`);
            // Los bloques del modo que siguen en la lista conservan su orden relativo.
            const base = baseOf(p, mode).filter((b) => ks.includes(b));
            fail(eq(ks.filter((b) => base.includes(b)), base), `orden del modo cambiado: ${ctx}`);
            // Sin tope, la misma lista en el mismo orden con algunos fuera: no se comprime ni se reordena nada.
            const untrimmed = planProposal({ ...p, max: {} }, mode, answers);
            fail(eq(keys(untrimmed).filter((b) => ks.includes(b)), ks), `el recorte reordena: ${ctx}`);
            for (const b of plan) fail(eq(b.props, untrimmed.find((u) => u.block === b.block)?.props), `el recorte cambia textos de ${b.block}: ${ctx}`);
            if (!max || untrimmed.length <= max) fail(eq(ks, keys(untrimmed)), `recorta sin pasar del tope: ${ctx}`);
          }
        }
        expect(errors).toEqual([]);
        expect(n).toBeGreaterThan(1);
      });

      test('cada bloque montado es válido para su plantilla (textos del sector encima de los del módulo)', () => {
        const errors = new Set<string>();
        for (const answers of distinctAnswers(p)) for (const mode of PRESET_MODES) {
          for (const b of planProposal(p, mode, answers)) {
            const e = blockError(b.module, b.props);
            if (e) errors.add(`${b.block} (${mode} [${answers.join(', ')}]): ${e}`);
          }
        }
        expect([...errors].slice(0, 5)).toEqual([]);
      });

      test('determinista: el orden de las respuestas y las respuestas que no existen no cambian nada', () => {
        let i = 0;
        for (const answers of allAnswers(p)) {
          if (i++ % 7) continue;
          for (const mode of PRESET_MODES) {
            const a = planProposal(p, mode, answers);
            expect(planProposal(p, mode, [...answers].reverse())).toEqual(a);
            expect(planProposal(p, mode, [...answers, 'no-existe', 'tipo:no-existe-tampoco'])).toEqual(a);
            expect(planProposal(p, mode, effectiveAnswers(p, answers))).toEqual(a);
          }
        }
      });

      test('sin respuestas = las opciones por defecto', () => {
        const defaults = effectiveAnswers(p, []);
        expect(defaults).toEqual(p.choices.filter((c) => !c.when?.length || c.when.some((w) => defaults.includes(w))).map((c) => `${c.key}:${c.default}`));
        for (const mode of PRESET_MODES) expect(planProposal(p, mode, [])).toEqual(planProposal(p, mode, defaults));
      });

      test('no modifica la receta', () => {
        const before = JSON.stringify(p);
        for (const answers of allAnswers(p)) for (const mode of PRESET_MODES) planProposal(p, mode, answers);
        expect(JSON.stringify(p)).toBe(before);
      });
    });
  }
});

describe('lo que dice docs/PROPOSAL_PRESETS.md de cada receta', () => {
  const recipe = (k: string) => proposalSchema.parse(segments.find((s) => s.key === k)!.proposal);
  const has = (p: Proposal, mode: PresetMode, answers: string[], block: string) => keys(planProposal(p, mode, answers)).includes(block);

  test('hoteles: 6 diapositivas fijas, sin preguntas ni precio', () => {
    const p = recipe('hoteles');
    expect(p.questions).toEqual([]);
    expect(p.choices).toEqual([]);
    const plan = planProposal(p, 'full', []);
    expect(plan).toHaveLength(6);
    expect(plan.map((b) => catalog.get(b.module)!.block_type)).not.toContain('pricing-card');
    expect(planProposal(p, 'visual', [])).toEqual(plan);
  });

  test('topes: ocio 8 (5 en apoyo visual), promotoras 7 (5), conciertos 8, festivales 8', () => {
    expect(recipe('ocio-nocturno').max).toMatchObject({ full: 8, visual: 5 });
    expect(recipe('promotoras').max).toMatchObject({ full: 7, visual: 5 });
    expect(recipe('conciertos').max.full).toBe(8);
    expect(recipe('festivales').max.full).toBe(8);
  });

  test('elecciones: ocio (4 tipos, ángulos A–F), promotoras (2 tipos, A–D, frecuencia), conciertos (5 tipos, A, B, D), festivales (4 tipos, A–D)', () => {
    const opts = (k: string) => Object.fromEntries(recipe(k).choices.map((c) => [c.key, c.options.map((o) => o.key)]));
    expect(opts('ocio-nocturno')).toEqual({ tipo: ['estandar', 'grupo', 'privados', 'caseta'], angulo: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(opts('promotoras')).toMatchObject({ tipo: ['pequena', 'asentada'], angulo: ['a', 'b', 'c', 'd'] });
    expect(opts('promotoras').frecuencia).toHaveLength(3);
    expect(opts('conciertos')).toEqual({ tipo: ['sala', 'promotor', 'artista', 'agencia', 'charanga'], angulo: ['a', 'b', 'd'] });
    expect(opts('festivales')).toEqual({ tipo: ['recinto', 'mediano', 'grande', 'infraestructura'], angulo: ['a', 'b', 'c', 'd'] });
    expect(recipe('ocio-nocturno').questions).toHaveLength(9);
    expect(recipe('ocio-nocturno').questions.map((q) => q.key)).toContain('karaoke');
    expect(recipe('promotoras').questions).toHaveLength(4);
    expect(recipe('conciertos').questions).toHaveLength(3);
    expect(recipe('festivales').questions).toHaveLength(3);
  });

  test('ocio nocturno: el ángulo solo con local o grupo; nunca dos ángulos', () => {
    const p = recipe('ocio-nocturno');
    expect(effectiveAnswers(p, ['tipo:privados', 'angulo:a'])).toEqual(['tipo:privados']);
    expect(effectiveAnswers(p, ['tipo:caseta', 'angulo:b'])).toEqual(['tipo:caseta']);
    expect(effectiveAnswers(p, ['tipo:grupo', 'angulo:b', 'angulo:c']).filter((a) => a.startsWith('angulo:'))).toEqual(['angulo:b']);
  });

  test('«En directo»: después de la pantalla; no entra sin pantalla, en caseta ni en charanga; lo primero que sale si no cabe', () => {
    for (const k of ['ocio-nocturno', 'conciertos', 'festivales']) {
      const p = recipe(k);
      const errors: string[] = [];
      for (const answers of distinctAnswers(p)) for (const mode of PRESET_MODES) {
        const ks = keys(planProposal(p, mode, answers));
        const ctx = `${k} ${mode} [${answers.join(', ')}]`;
        const eff = answers;
        if ((eff.includes('sin-pantalla') || eff.includes('tipo:caseta') || eff.includes('tipo:charanga')) && ks.includes('en-directo')) errors.push(`entra sin pantalla: ${ctx}`);
        const untrimmed = keys(planProposal({ ...p, max: {} }, mode, answers));
        const max = maxOf(p, mode);
        if (max && untrimmed.length > max && ks.includes('en-directo')) errors.push(`no es lo primero que sale: ${ctx} → ${ks.join(', ')}`);
        const i = ks.indexOf('en-directo');
        if (i === 0 || (i > 0 && catalog.get(p.blocks[ks[i - 1]].module)!.block_type !== 'live-screen')) errors.push(`no va tras la pantalla: ${ctx} → ${ks.join(', ')}`);
      }
      expect(errors.slice(0, 10)).toEqual([]);
    }
  });

  test('ocio nocturno: en el ángulo D y en grupos el caso se queda antes que los condicionales', () => {
    const p = recipe('ocio-nocturno');
    const errors: string[] = [];
    for (const answers of distinctAnswers(p)) {
      if (!answers.includes('angulo:d') && !answers.includes('tipo:grupo')) continue;
      for (const mode of PRESET_MODES) {
        const untrimmed = keys(planProposal({ ...p, max: {} }, mode, answers));
        const ks = keys(planProposal(p, mode, answers));
        const caso = untrimmed.filter((b) => b.startsWith('caso-'));
        for (const c of caso) if (!ks.includes(c)) errors.push(`${mode} [${answers.join(', ')}] pierde ${c}: ${ks.join(', ')}`);
      }
    }
    expect(errors.slice(0, 5)).toEqual([]);
  });

  test('«En directo» sí sale con pantalla en locales, conciertos y festivales cuando cabe', () => {
    expect(has(recipe('ocio-nocturno'), 'full', [], 'en-directo')).toBe(true);
    expect(has(recipe('conciertos'), 'full', [], 'en-directo')).toBe(true);
    expect(has(recipe('festivales'), 'full', [], 'en-directo')).toBe(true);
  });
});
