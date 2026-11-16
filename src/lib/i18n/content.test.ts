import { describe, expect, test } from 'vitest';
import { applyTexts, batchTexts, extractTexts, isText, planWork, sourceHash, type ContentItem } from './content';

describe('contenido traducido', () => {
  test('solo texto para leer: ni claves, ni enlaces, ni rutas, ni números', () => {
    expect(isText('Condiciones')).toBe(true);
    expect(isText('Inmersión a las 9:00')).toBe(true);
    expect(isText('como-funciona-v')).toBe(false);
    expect(isText('asset:img/x.png')).toBe(false);
    expect(isText('https://oquea.app')).toBe(false);
    expect(isText('26/02/2026')).toBe(false);
  });

  test('saca los textos de una jugada y de las props de un módulo, sin claves ni medios', () => {
    expect(extractTexts('play', { title: 'Abrir', body: 'Hola {company}', whenToUse: null, key: 'abrir', kind: 'opener' }))
      .toEqual([['title', 'Abrir'], ['body', 'Hola {company}']]);
    const props = { title: 'Tu nombre', screens: [{ screen: 'share-card' }], photo: 'asset:x.webp', cards: [{ icon: 'check', title: 'En todas' }], sample: { cards: ['dive'], activity: 'Inmersión a las 9:00' } };
    expect(extractTexts('module_version', { props })).toEqual([
      ['props/title', 'Tu nombre'], ['props/cards/0/title', 'En todas'], ['props/sample/activity', 'Inmersión a las 9:00'],
    ]);
  });

  test('pone la traducción encima sin tocar el original ni lo que ha cambiado de forma', () => {
    const src = { title: 'Abrir', body: 'Hola', list: ['uno'] };
    const out = applyTexts(src, { title: '열기', 'list/0': '하나', missing: 'x', 'body/0': 'y' });
    expect(out).toEqual({ title: '열기', body: 'Hola', list: ['하나'] });
    expect(src.title).toBe('Abrir');
  });

  test('la huella cambia si cambia un texto', () => {
    expect(sourceHash([['title', 'A']])).not.toBe(sourceHash([['title', 'B']]));
    expect(sourceHash([['title', 'A']])).toHaveLength(32);
  });
});


describe('qué traducir', () => {
  const a: ContentItem = { kind: 'play', ref: 'a', pairs: [['title', 'Abrir']] };
  const b: ContentItem = { kind: 'play', ref: 'b', pairs: [['title', 'Cerrar']] };
  test('solo lo nuevo o cambiado; lo revisado sin cambios se queda; lo que ya no existe se borra', () => {
    const stored = [
      { kind: 'play' as const, ref: 'a', sourceHash: sourceHash(a.pairs), status: 'reviewed' as const },
      { kind: 'play' as const, ref: 'b', sourceHash: 'otra-huella', status: 'auto' as const },
      { kind: 'play' as const, ref: 'z', sourceHash: 'x', status: 'auto' as const },
    ];
    const { todo, stale } = planWork([a, b], stored);
    expect(todo.map((x) => x.ref)).toEqual(['b']);
    expect(stale.map((x) => x.ref)).toEqual(['z']);
    expect(planWork([a, b], stored, true).todo).toHaveLength(2);
  });
  test('tandas de textos únicos', () => {
    const items: ContentItem[] = [a, { ...b, pairs: [['title', 'Abrir'], ['body', 'x'.repeat(10)]] }];
    expect(batchTexts(items, 12)).toEqual([['Abrir'], ['x'.repeat(10)]]);
  });
});

describe('frases de la receta en la propuesta (lo que escribe un ángulo)', () => {
  const proposal = { choices: [{ key: 'angulo', options: [{ key: 'abrir', label: 'Abrir mercado', rules: [{ patch: 'portada', set: { title: '{company}, centro fundador' } }] }] }] };
  const texts = { 'proposal/choices/0/options/0/label': '시장 열기', 'proposal/choices/0/options/0/rules/0/set/title': '{company}, 창립 센터' };

  test('saca «original → traducción» de la receta traducida', async () => {
    const { phrasePairs } = await import('./content');
    expect(phrasePairs({ proposal }, texts)).toEqual({ 'Abrir mercado': '시장 열기', '{company}, centro fundador': '{company}, 창립 센터' });
  });

  test('cambia solo los textos que casan exactos; lo escrito a mano se queda', async () => {
    const { applyPhrases } = await import('./content');
    const ov = { title: '{company}, centro fundador', tip: { kind: 'info', text: 'Escrito a mano' }, cards: ['{company}, centro fundador'] };
    expect(applyPhrases(ov, { '{company}, centro fundador': '{company}, 창립 센터' })).toEqual({ title: '{company}, 창립 센터', tip: { kind: 'info', text: 'Escrito a mano' }, cards: ['{company}, 창립 센터'] });
  });

  test('la propuesta pública (demo): solo las frases que están en sus cambios', async () => {
    const { demoDb } = await import('../data/store');
    const { demoRepository } = await import('../data/demo');
    const db = demoDb() as any;
    const OQ = '00000000-0000-4000-8000-000000000b01';
    const seg = { id: '00000000-0000-4000-8000-0000000b5e99', tenant_id: OQ, key: 'prueba-frases', name: 'Prueba', proposal };
    db.segment.push(seg);
    (db.content_i18n ??= []).push({ tenant_id: OQ, locale: 'ko', kind: 'segment', ref: seg.id, texts, source_hash: 'x'.repeat(16), status: 'auto' });
    const item = db.dossier_item.find((i: any) => i.dossier_id === '00000000-0000-4000-8000-0000000b0d51');
    const before = item.prop_overrides;
    item.prop_overrides = { ...(before ?? {}), title: '{company}, centro fundador' };
    try {
      const ph = await demoRepository().getPublicContentPhrases('demo-oquea-ko-5Rt8', OQ);
      expect(ph).toEqual({ '{company}, centro fundador': '{company}, 창립 센터' }); // «Abrir mercado» no está en la propuesta
      expect(await demoRepository().getPublicContentPhrases('no-existe-0000', OQ)).toEqual({});
    } finally {
      item.prop_overrides = before;
      db.segment.splice(db.segment.indexOf(seg), 1);
      db.content_i18n.pop();
    }
  });
});
