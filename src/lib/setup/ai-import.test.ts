import { describe, expect, it, test } from 'vitest';
import { extractJson, importBlock, kindOf, parseBlock, periodOf, preview, promptFor, roleOf } from './ai-import';

describe('configuración con IA', () => {
  it('saca el JSON aunque venga con texto y ```json alrededor', () => {
    expect(extractJson('Aquí lo tienes:\n```json\n{"a": 1}\n```\n¡Suerte!')).toEqual({ a: 1 });
    expect(extractJson('blah {"a": {"b": 2}} fin')).toEqual({ a: { b: 2 } });
    expect(() => extractJson('sin json')).toThrow(/No encuentro/);
    expect(() => extractJson('```json\n{"a": \n```')).toThrow(/cortado/);
  });
  it('entiende papeles, tipos de jugada y cobros dichos a su manera', () => {
    expect(roleOf('Quien decide')).toBe('decisor');
    expect(roleOf('Guardián')).toBe('guardian');
    expect(roleOf('algo raro')).toBe('influenciador');
    expect(kindOf('Objeción')).toBe('objection');
    expect(kindOf('guion')).toBe('script');
    expect(periodOf('al mes')).toBe('month');
    expect(periodOf('Por evento')).toBe('event');
  });
  it('el formato equivocado en el paso equivocado se explica', () => {
    expect(() => parseBlock('empresa', '{"sectores": []}')).toThrow(/paso correcto/);
    const p = parseBlock('precios', '{"tarifas": [{"nombre": "Local", "importe": "249 €", "cobro": "mes"}]}');
    expect(p.tarifas[0].importe).toBe(249);
    expect(p.descuentos).toEqual([]);
  });
  it('el prompt lleva a quién ayuda, la primera pregunta y el formato', () => {
    const t = promptFor('mercado', { person: 'Cristian', company: 'Enjoy' });
    expect(t).toContain('Eres el asistente de Cristian, de Enjoy');
    expect(t).toContain('```json');
    expect(t).toContain('"actores"');
  });
  it('vista previa: solo añade lo que falta; importar escribe lo mismo', async () => {
    const saved: unknown[] = [];
    const deps = {
      playbook: {
        market: async () => [{ id: 's1', key: 'locales', name: 'Locales', personas: [{ key: 'propietario', name: 'Dueño' }] }],
        saveSegment: async (i: unknown) => { saved.push(i); return 's2'; }, savePersona: async (i: unknown) => { saved.push(i); return 'p'; },
        listAll: async () => ({ plays: [] }), createPlay: async (i: unknown) => { saved.push(i); return 'x'; },
      },
      evidence: { facets: async () => [], saveFacet: async (i: unknown) => saved.push(i) },
      prices: { list: async () => [], save: async (i: Record<string, unknown>) => { saved.push(i); return 'o'; } },
      coupons: { list: async () => [], save: async (i: unknown) => saved.push(i) },
    };
    const data = parseBlock('mercado', JSON.stringify({ sectores: [
      { nombre: 'Locales', actores: [{ nombre: 'Dueño', papel: 'decisor' }, { nombre: 'DJ', papel: 'guardian' }] },
      { nombre: 'Festivales', actores: [{ nombre: 'Director', papel: 'decide' }] },
    ] }));
    const pv = await preview('mercado', data, deps);
    expect(pv.skip).toEqual(['Sector Locales', 'Dueño (Locales)']);
    expect(pv.add).toEqual(['DJ (Locales) · guardian', 'Sector Festivales', 'Director (Festivales) · decisor']);
    expect(saved).toEqual([]);
    await importBlock('mercado', data, deps);
    expect(saved).toHaveLength(3);
  });
});

describe('configuración con IA: casos límite', () => {
  /** Dependencias en memoria que apuntan qué se guardaría. */
  function deps(have: { plays?: string[]; facets?: string[]; prices?: string[]; coupons?: string[] } = {}) {
    const saved: Array<{ what: string; i: unknown }> = [];
    return {
      saved,
      d: {
        playbook: {
          market: async () => [{ id: 's1', key: 'locales', name: 'Locales', personas: [] }],
          saveSegment: async (i: unknown) => { saved.push({ what: 'segment', i }); return 's2'; },
          savePersona: async (i: unknown) => { saved.push({ what: 'persona', i }); return 'p'; },
          listAll: async () => ({ plays: (have.plays ?? []).map((key) => ({ key, title: key })) }),
          createPlay: async (i: unknown) => { saved.push({ what: 'play', i }); return 'x'; },
        },
        evidence: { facets: async () => (have.facets ?? []).map((key) => ({ key })), saveFacet: async (i: unknown) => saved.push({ what: 'facet', i }) },
        prices: { list: async () => (have.prices ?? []).map((label) => ({ label })), save: async (i: Record<string, unknown>) => { saved.push({ what: 'price', i }); return 'o'; } },
        coupons: { list: async () => (have.coupons ?? []).map((code) => ({ code })), save: async (i: unknown) => saved.push({ what: 'coupon', i }) },
      },
    };
  }

  test('lo que sobra se recorta y lo que falta queda vacío (tolerante con el asistente)', () => {
    // Un texto demasiado largo NO se recorta: se rechaza (el admin lo ve y lo pide más corto). Las listas sí se recortan.
    expect(() => parseBlock('empresa', JSON.stringify({ empresa: { nombre: 'x'.repeat(81) } }))).toThrow(/paso correcto/);
    const ok = parseBlock('empresa', JSON.stringify({ empresa: { nombre: 'Enjoy', pruebas: Array.from({ length: 30 }, (_, i) => `p${i}`), que_vendemos: null } }));
    expect(ok.empresa.pruebas).toHaveLength(10);
    expect(ok.empresa.que_vendemos).toBe('');
    expect(parseBlock('jugadas', '{"jugadas": "no es una lista"}').jugadas).toEqual([]);
  });

  test('importe: número o texto con símbolo; negativo no vale', () => {
    const imp = (v: unknown) => parseBlock('precios', JSON.stringify({ tarifas: [{ nombre: 'T', importe: v }] })).tarifas[0].importe;
    expect(imp(249)).toBe(249);
    expect(imp('249 €')).toBe(249);
    expect(imp('99,90 €')).toBe(99.9);
    expect(() => imp(-5)).toThrow(/paso correcto/);
    // Hoy, un importe sin cifras («gratis», «a consultar») o que falta se queda en 0 € (no se rechaza). Se fija aquí
    // para que cambiarlo sea a propósito: una tarifa a 0 € se ve en la vista previa antes de importar.
    expect(imp('a consultar')).toBe(0);
    expect(parseBlock('precios', '{"tarifas": [{"nombre": "T"}]}').tarifas[0].importe).toBe(0);
  });

  // BUG (src/lib/setup/ai-import.ts:38, importe de «precios»): el separador de miles español se toma por decimal.
  // «1.200 €» → 1.2 € (la tarifa se crea 1000 veces más barata, sin avisar) y «1.200,50 €» → NaN → el bloque entero se
  // rechaza. Arreglo: si hay coma, quitar los puntos y usar la coma como decimal; si solo hay puntos seguidos de 3
  // cifras, son miles. Quitar `.fails` cuando esté arreglado.
  test.fails('importe con separador de miles español («1.200 €», «1.200,50 €»)', () => {
    const imp = (v: unknown) => parseBlock('precios', JSON.stringify({ tarifas: [{ nombre: 'T', importe: v }] })).tarifas[0].importe;
    expect(imp('1.200 €')).toBe(1200);
    expect(imp('1.200,50 €')).toBe(1200.5);
  });

  test('descuento: porcentaje 0–100; el código va en MAYÚSCULAS sin espacios ni signos', async () => {
    expect(() => parseBlock('precios', '{"tarifas": [], "descuentos": [{"codigo": "X", "porcentaje": 150}]}')).toThrow(/paso correcto/);
    const data = parseBlock('precios', JSON.stringify({ tarifas: [], descuentos: [
      { codigo: 'lanza 30!', nombre: '', porcentaje: '30 %', a_cambio_de: 'pagar el año' },
      { codigo: 'cero', porcentaje: 0 },
      { codigo: 'YAESTA', porcentaje: 10 },
    ] }));
    const { d, saved } = deps({ coupons: ['yaesta'] });
    const pv = await importBlock('precios', data, d);
    expect(pv).toEqual({ add: ['Descuento LANZA30 · 30 % (a cambio de: pagar el año)'], skip: ['Descuento YAESTA'] });
    expect(saved).toEqual([{ what: 'coupon', i: { code: 'LANZA30', label: '30 %', kind: 'percent', value: '30', note: 'pagar el año' } }]);
  });

  // BUG (src/lib/setup/ai-import.ts:303-305, descuentos): el filtro mira el código ANTES de limpiarlo; un código hecho
  // solo de signos o letras con tilde («¡Ñ!», «€€») se queda vacío y se intenta crear un cupón con código "". Arreglo:
  // limpiar primero y saltar los que queden vacíos. Quitar `.fails` cuando esté arreglado.
  test.fails('un código que se queda vacío al limpiarlo no se importa', async () => {
    const data = parseBlock('precios', JSON.stringify({ tarifas: [], descuentos: [{ codigo: '¡Ñ!', porcentaje: 10 }] }));
    const { d, saved } = deps();
    await importBlock('precios', data, d);
    expect(saved).toEqual([]);
  });

  test('tarifas: no se repiten por nombre (sin tildes ni mayúsculas) y van al sector por su nombre', async () => {
    const data = parseBlock('precios', JSON.stringify({ tarifas: [
      { tipo: 'Local', nombre: 'Local pequeño', importe: 99, cobro: 'al mes', sector: 'locales', tipica: 'sí' },
      { nombre: 'LOCAL PEQUENO', importe: 1 },
      { nombre: 'Evento', importe: 150, cobro: 'raro', sector: 'Inventado' },
      { nombre: '', importe: 5 },
    ] }));
    const { d, saved } = deps({ prices: ['Ya Existe'] });
    const pv = await preview('precios', data, d);
    expect(pv.add).toEqual(['Local · Local pequeño · 99 € / mes (típica)', 'Evento · 150 €']);
    expect(pv.skip).toEqual(['LOCAL PEQUENO']);
    expect(saved).toEqual([]);   // la vista previa no escribe
    await importBlock('precios', data, d);
    expect(saved.map((x) => x.i)).toEqual([
      { label: 'Local pequeño', amount: 99, period: 'month', segmentId: 's1', kind: 'Local', isDefault: true },
      { label: 'Evento', amount: 150, period: 'once', segmentId: '', kind: null, isDefault: false },
    ]);
  });

  test('situaciones: sin opciones no se crea; opciones sin repetir; «persona» va a la persona', async () => {
    const data = parseBlock('situaciones', JSON.stringify({ situaciones: [
      { nombre: 'Temporada', pregunta: '¿Cuándo?', de: 'cuenta', varias: 'sí', opciones: ['Verano', 'Verano', 'Invierno', ''] },
      { nombre: 'Carácter', de: 'Persona', opciones: ['Analítico'] },
      { nombre: 'Vacía', opciones: [] },
      { nombre: 'Ya está', opciones: ['x'] },
    ] }));
    const { d, saved } = deps({ facets: ['ya-esta'] });
    const pv = await importBlock('situaciones', data, d);
    expect(pv).toEqual({ add: ['Temporada: Verano, Invierno', 'Carácter: Analítico'], skip: ['Ya está'] });
    expect(saved.map((x) => x.i)).toMatchObject([
      { key: 'temporada', scope: 'account', multi: true, options: [{ label: 'Verano', key: 'verano' }, { label: 'Invierno', key: 'invierno' }], status: 'official' },
      { key: 'caracter', scope: 'contact', multi: false },
    ]);
  });

  test('jugadas: dos con el mismo título no se duplican; las ya importadas se saltan; tipo desconocido → consejo', async () => {
    const data = parseBlock('jugadas', JSON.stringify({ jugadas: [
      { tipo: 'objeción', titulo: 'Es caro', texto: 'Divide por invitado', sectores: ['Locales', 'Inventado'] },
      { tipo: 'objecion', titulo: 'Es caro', texto: 'otra vez' },
      { tipo: 'raro', titulo: 'Cierra el jueves', texto: 'x' },
      { tipo: 'pitch', titulo: 'Ya importada', texto: 'x' },
      { titulo: '', texto: 'sin título' },
    ] }));
    const { d, saved } = deps({ plays: ['ia-ya-importada'] });
    const pv = await importBlock('jugadas', data, d);
    expect(pv).toEqual({ add: ['Es caro · objection', 'Cierra el jueves · tip'], skip: ['Es caro', 'Ya importada'] });
    expect(saved.map((x) => x.i)).toMatchObject([{ key: 'ia-es-caro', kind: 'objection', segments: ['locales'], status: 'official' }, { key: 'ia-cierra-el-jueves', kind: 'tip' }]);
  });

  test('empresa: crea solo los textos que tienen contenido, una vez', async () => {
    const data = parseBlock('empresa', JSON.stringify({ empresa: { nombre: 'Enjoy', que_vendemos: 'Pantallas', pruebas: ['', ' '], no_somos: '' } }));
    const { d, saved } = deps({ plays: [] });
    expect(await importBlock('empresa', data, d)).toEqual({ add: ['Qué vendemos en Enjoy'], skip: [] });
    expect(saved).toHaveLength(1);
    const again = deps({ plays: ['ia-que-vendemos'] });
    expect(await importBlock('empresa', data, again.d)).toEqual({ add: [], skip: ['Qué vendemos en Enjoy'] });
  });

  test('extractJson: el primer bloque ```json manda aunque haya más', () => {
    expect(extractJson('```json\n{"a": 1}\n```\ny otro\n```json\n{"a": 2}\n```')).toEqual({ a: 1 });
    expect(() => extractJson('')).toThrow(/No encuentro/);
  });
});
