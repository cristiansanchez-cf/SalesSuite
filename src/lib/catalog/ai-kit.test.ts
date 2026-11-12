import { describe, expect, test } from 'vitest';
import { applyKit, extractJson, kitPrompt, kitTypes, planKit, readKit, type CatalogWriter } from './ai-kit';
import { changedTexts, editPrompt, fixtureCatalogEdit, readEdit } from './ai-edit';
import { REGISTRY } from '../../modules/registry';

const hero = { key: 'portada', blockType: 'hero-pitch', name: 'Portada', description: null, props: REGISTRY['hero-pitch'].example };

describe('kit «con tu IA»', () => {
  test('el prompt lleva los tipos generales, los especiales que ya usa y su catálogo', () => {
    const p = kitPrompt({ company: 'Acme', person: 'Teresa', locale: 'es-ES', catalog: [hero, { ...hero, key: 'sello', blockType: 'seal-showcase', name: 'Sello' }] });
    expect(p).toContain('Teresa, de Acme');
    expect(p).toContain('### tabs-showcase');
    expect(p).toContain('### seal-showcase');
    expect(p).not.toContain('### live-screen');
    expect(p).toContain('key "portada"');
    expect(p).toContain('peticiones');
    expect(kitTypes([])).not.toContain('site-verify');
  });

  test('lee el JSON con o sin bloque de código y texto alrededor', () => {
    expect(extractJson('Aquí lo tienes:\n```json\n{"a":1}\n```\n¿Algo más?')).toEqual({ a: 1 });
    expect(extractJson('{"a":2}')).toEqual({ a: 2 });
    expect(extractJson('nada')).toBeNull();
    expect(readKit('nada').errors[0]).toMatch(/JSON/);
    expect(readKit('{"modules":[{"key":"aa","block_type":"hero-pitch","name":"A","props":{}},{"key":"aa","block_type":"hero-pitch","name":"B","props":{}}]}').errors[0]).toMatch(/dos veces/);
  });

  test('plan: nuevo, cambia, igual y no vale (tipo, formato o key de otro tipo)', () => {
    const { kit } = readKit(JSON.stringify({
      modules: [
        { key: 'nuevo', block_type: 'problem-solution', name: 'Nuevo', props: REGISTRY['problem-solution'].example },
        { key: 'portada', block_type: 'hero-pitch', name: 'Portada', props: { ...REGISTRY['hero-pitch'].example, title: 'Otro título' } },
        { key: 'igual', block_type: 'hero-pitch', name: 'Igual', props: REGISTRY['hero-pitch'].example },
        { key: 'raro', block_type: 'no-existe', name: 'Raro', props: {} },
        { key: 'mal', block_type: 'tabs-showcase', name: 'Mal', props: { tabs: 'no' } },
        { key: 'otro-tipo', block_type: 'tabs-showcase', name: 'X', props: REGISTRY['tabs-showcase'].example },
      ],
      peticiones: ['Una animación del producto'],
    }));
    const rows = planKit(kit!, [hero, { ...hero, key: 'igual', name: 'Igual' }, { ...hero, key: 'otro-tipo' }]);
    expect(rows.map((r) => r.action)).toEqual(['new', 'update', 'same', 'invalid', 'invalid', 'invalid']);
    expect(rows[5].errors[0]).toMatch(/otra key/);
    expect(kit!.peticiones).toEqual(['Una animación del producto']);
  });

  test('crea borradores (nunca publica) y conserva el precio del módulo que cambia', async () => {
    const calls: string[] = [];
    const t: CatalogWriter = {
      async listCatalog() { return [{ id: 'm1', key: 'portada', name: 'Portada', description: null, versions: [{ id: 'v1', status: 'published', version: 1, defaultPrice: 99, currency: 'EUR' }] }]; },
      async createModule(i) { calls.push(`create ${(i as { key: string }).key}`); return { moduleId: 'm2', versionId: 'v2' }; },
      async updateModule(id) { calls.push(`update ${id}`); },
      async newDraft(id) { calls.push(`draft ${id}`); return 'v3'; },
      async saveDraft(id, i) { calls.push(`save ${id} ${(i as { defaultPrice: number | null }).defaultPrice}`); },
    };
    const { kit } = readKit(JSON.stringify({ modules: [
      { key: 'portada', block_type: 'hero-pitch', name: 'Portada nueva', props: REGISTRY['hero-pitch'].example },
      { key: 'casos', block_type: 'case-study', name: 'Casos', props: REGISTRY['case-study'].example },
    ] }));
    const made = await applyKit(kit!, planKit(kit!, [hero]), t);
    expect(made.map((x) => [x.key, x.isNew])).toEqual([['portada', false], ['casos', true]]);
    expect(calls).toEqual(['draft m1', 'update m1', 'save v3 99', 'create casos', 'save v2 null']);
    expect(calls.some((c) => c.startsWith('publish'))).toBe(false);
  });
});

describe('«pídele un cambio»', () => {
  test('el prompt marca la instrucción y la recorta', () => {
    const p = editPrompt({ blockType: 'hero-pitch', name: 'Portada', props: { title: 'Hola' }, instruction: 'x'.repeat(1000), locale: 'es-ES' });
    expect(p).toContain('<<<');
    expect(p.match(/x+/)![0].length).toBe(400);
  });

  test('solo acepta contenido con el formato de su tipo', () => {
    expect(readEdit('hero-pitch', { props: REGISTRY['hero-pitch'].example, summary: 'ok' }).result?.summary).toBe('ok');
    expect(readEdit('tabs-showcase', { props: { tabs: 'no' } }).result).toBeNull();
    expect(readEdit('hero-pitch', { summary: 'sin props' }).result).toBeNull();
  });

  test('qué textos cambian', () => {
    expect(changedTexts({ title: 'A', tabs: [{ t: 'x' }, { t: 'y' }] }, { title: 'B', tabs: [{ t: 'x' }] })).toEqual([
      { path: 'title', before: 'A', after: 'B' }, { path: 'tabs[1].t', before: 'y', after: '' },
    ]);
  });

  test('el de prueba cambia «X» por «Y» en todos los textos', async () => {
    const r = await fixtureCatalogEdit().edit({ blockType: 'hero-pitch', name: 'P', props: { title: 'Hola mundo', ctas: [{ label: 'Hola' }] }, instruction: 'cambia «Hola» por «Buenas»', locale: 'es-ES' });
    expect(r?.props).toEqual({ title: 'Buenas mundo', ctas: [{ label: 'Buenas' }] });
  });
});
