import { describe, expect, test } from 'vitest';
import { blockCounts, docMarkdown, docText, fromNotion, renderDoc, textHash, type DocBlock } from './doc';
import { channelOf, extractEntries, leadDate } from './entries';
import { httpNotion, notionId, propValue } from './client';

// Bloques como los da la API de Notion (inventados).
const rt = (t: string, a: Record<string, boolean> = {}, href: string | null = null) => ({ type: 'text', plain_text: t, href, annotations: a });
const blk = (type: string, text: string | ReturnType<typeof rt>[], extra: Record<string, unknown> = {}, children?: unknown[]) => ({
  type, has_children: !!children?.length, [type]: { rich_text: typeof text === 'string' ? [rt(text)] : text, ...extra }, ...(children ? { children } : {}),
});
const h = (n: 1 | 2 | 3, t: string) => blk(`heading_${n}`, t);
const li = (t: string, children?: unknown[]) => blk('bulleted_list_item', t, {}, children);
const doc = (bs: unknown[]): DocBlock[] => bs.map(fromNotion);

describe('el documento', () => {
  const page = doc([
    h(2, 'Contexto'),
    blk('paragraph', [rt('Grupo con '), rt('varias sociedades', { bold: true }), rt('. Web: '), rt('aquí', {}, 'https://ejemplo.test/x'), rt(' y '), rt('mal', {}, 'javascript:alert(1)')]),
    { type: 'table', has_children: true, table: { has_column_header: true }, children: [
      { type: 'table_row', table_row: { cells: [[rt('Persona')], [rt('Rol')]] } },
      { type: 'table_row', table_row: { cells: [[rt('Ana <b>')], [rt('CEO | CFO')]] } },
    ] },
    blk('toggle', 'Correo enviado', {}, [blk('quote', 'Hola, <script>x</script>')]),
    blk('numbered_list_item', 'Uno'), blk('numbered_list_item', 'Dos'),
    blk('to_do', 'Hecho', { checked: true }),
    { type: 'divider', has_children: false, divider: {} },
    { type: 'mystery_block', has_children: false, mystery_block: {} },
  ]);

  test('texto, huella y recuento (lo que se verifica contra Notion)', () => {
    const txt = docText(page);
    expect(txt).toContain('Grupo con varias sociedades. Web: aquí y mal');
    expect(txt).toContain('Persona | Rol');
    expect(txt).toContain('Hola, <script>x</script>');
    expect(textHash(txt)).toBe(textHash(`${txt}\n\n  `));
    expect(textHash(txt)).not.toBe(textHash(txt.replace('Dos', 'Tres')));
    expect(blockCounts(page)).toMatchObject({ heading: 1, paragraph: 1, table: 1, toggle: 1, quote: 1, numbered: 2, todo: 1, unsupported: 1 });
  });

  test('HTML escapado: sin etiquetas de nadie y sin enlaces raros', () => {
    const html = renderDoc(page);
    expect(html).toContain('<strong>varias sociedades</strong>');
    expect(html).toContain('<a href="https://ejemplo.test/x"');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Ana &lt;b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<details class="doc-toggle"><summary>Correo enviado</summary><blockquote>');
    expect(html).toContain('<thead><tr><th>Persona</th>');
    expect(html).toContain('<ol><li>Uno</li><li>Dos</li></ol>');
  });

  test('Markdown (las notas de las interacciones)', () => {
    const md = docMarkdown(page);
    expect(md).toContain('## Contexto');
    expect(md).toContain('Grupo con **varias sociedades**. Web: [aquí](https://ejemplo.test/x)');
    expect(md).toContain('| Persona | Rol |');
    expect(md).toContain('| Ana <b> | CEO \\| CFO |');
    expect(md).toContain('1. Uno\n2. Dos');
  });
});

describe('las fechas de la bitácora', () => {
  test('exactas, sin año, con hora y aproximadas', () => {
    expect(leadDate('3 nov 2026')).toMatchObject({ y: 2026, m: 11, d: 3 });
    expect(leadDate('18 sept 2026')).toMatchObject({ y: 2026, m: 9, d: 18 });
    expect(leadDate('2026-06-03 — Llamada')).toMatchObject({ y: 2026, m: 6, d: 3 });
    expect(leadDate('16-jun-2026 — Mensaje')).toMatchObject({ y: 2026, m: 6, d: 16 });
    expect(leadDate('14/06/2026')).toMatchObject({ y: 2026, m: 6, d: 14 });
    expect(leadDate('23-jun · Propuesta')).toMatchObject({ y: null, m: 6, d: 23 });
    expect(leadDate('02/06')).toMatchObject({ y: null, m: 6, d: 2 });
    expect(leadDate('12-may 20:16 enviado')).toMatchObject({ y: null, m: 5, d: 12, hh: 20, mm: 16 });
    for (const [s, why] of [['10–13 oct 2026', 'rango'], ['12-may → 14-jun', 'rango'], ['~26 jun — confirma', 'aproximada'], ['Antes de la 1ª reunión', 'aproximada'], ['Hasta el 2 oct 2026', 'aproximada'], ['mediados sept.', 'aproximada']] as const) {
      expect(leadDate(s)).toEqual({ approx: why });
    }
    expect(leadDate('Reunión inicial (mediados sept. 2026)')).toBeNull();
    expect(leadDate('1 marca nueva')).toBeNull();
    expect(leadDate('31 feb 2026')).toMatchObject({ d: 31, m: 2 }); // se descarta al ver que no existe
  });

  test('el canal, solo si el título lo dice', () => {
    expect(channelOf('16-jun-2026 — Mensaje de reactivación enviado (WhatsApp)')).toBe('whatsapp');
    expect(channelOf('2026-06-03 — Llamada + Rechazo formal por email')).toBe('phone');
    expect(channelOf('29 jun 2026 — REUNIÓN realizada')).toBe('meeting');
    expect(channelOf('18 sept 2026')).toBe('other');
  });

  test('entradas: subtítulos de la bitácora, viñetas del historial y títulos con fecha; el año de la anterior', () => {
    const page = doc([
      h(2, 'Contexto'), li('Nada de fechas aquí: 3 nov 2026'),
      h(2, 'Historial'),
      li('20 abr 2026: primer contacto', [li('detalle')]),
      li('23 abr: contesta por email'),
      li('(silencio desde finales de abril)'),
      h(2, 'Bitácora'),
      h(3, 'Antes de la 1ª reunión (sept. 2026)'), li('investigación'),
      h(3, '18 sept 2026'), li('envío del cuestionario'),
      h(3, '10–13 oct 2026'), li('revisión'),
      h(3, '31 feb 2026'),
      h(2, 'Jugada actual'), blk('numbered_list_item', 'algo'),
      h(2, 'Riesgos'),
      h(3, '2 jul 2026 — Cerrado ganado'), li('firmado'),
      h(2, '23-jun · Propuesta enviada'), li('sin año y sin otra con año en su lista'),
    ]);
    const es = extractEntries(page);
    expect(es.map((e) => [e.title.slice(0, 22), e.kind, e.why, e.at?.slice(0, 10) ?? null, e.yearFromPrevious, e.section])).toEqual([
      ['20 abr 2026: primer co', 'exact', null, '2026-04-20', false, 'Historial'],
      ['23 abr: contesta por e', 'exact', null, '2026-04-23', true, 'Historial'],
      ['(silencio desde finale', 'approx', 'sin fecha', null, false, 'Historial'],
      ['Antes de la 1ª reunión', 'approx', 'aproximada', null, false, 'Bitácora'],
      ['18 sept 2026', 'exact', null, '2026-09-18', false, 'Bitácora'],
      ['10–13 oct 2026', 'approx', 'rango', null, false, 'Bitácora'],
      ['31 feb 2026', 'approx', 'fecha imposible', null, false, 'Bitácora'],
      ['2 jul 2026 — Cerrado g', 'exact', null, '2026-07-02', false, 'Título'],
      ['23-jun · Propuesta env', 'approx', 'sin año', null, false, 'Título'],
    ]);
    expect(es[0].note).toBe('- 20 abr 2026: primer contacto\n  - detalle');
    expect(es[4].note).toBe('### 18 sept 2026\n- envío del cuestionario');
    // Solo el día: a las 10:00 de Madrid (como los próximos pasos sin hora), y se marca para enseñarlo sin hora.
    expect(es[4].at).toBe('2026-09-18T08:00:00.000Z');
    expect(es[4].dateOnly).toBe(true);
  });

  test('con hora escrita, a esa hora', () => {
    const [e] = extractEntries(doc([h(2, 'Historial'), li('12 may 2026'), li('13-may 20:16 propuesta enviada')]).slice(0)).slice(1);
    expect(e).toMatchObject({ kind: 'exact', dateOnly: false, at: '2026-05-13T18:16:00.000Z', yearFromPrevious: true });
  });
});

describe('cliente de Notion (solo lectura)', () => {
  test('el id sale del enlace', () => {
    expect(notionId('https://app.notion.com/p/ad1636b0d71e830ca10f81428c4eb1f0?pvs=4')).toBe('ad1636b0-d71e-830c-a10f-81428c4eb1f0');
    expect(notionId('https://www.notion.so/Mi-base-0123456789abcdef0123456789abcdef')).toBe('01234567-89ab-cdef-0123-456789abcdef');
    expect(notionId('nada')).toBeNull();
  });
  test('lee filas y bloques con sus hijos, con la versión y la clave; nunca escribe', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: String(init.method) });
      expect((init.headers as Record<string, string>)['Notion-Version']).toBe('2025-09-03');
      const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (url.endsWith('/query')) return ok({ results: [{ object: 'page', id: 'p1', url: 'https://www.notion.so/p1', created_time: 'x', last_edited_time: 'y', properties: {} }], has_more: false });
      if (url.includes('/blocks/p1/children')) return ok({ results: [{ id: 't1', type: 'toggle', has_children: true, toggle: { rich_text: [rt('T')] } }], has_more: false });
      if (url.includes('/blocks/t1/children')) return ok({ results: [{ id: 'q1', type: 'paragraph', has_children: false, paragraph: { rich_text: [rt('dentro')] } }], has_more: false });
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    const api = httpNotion('secret', f, { gapMs: 0 });
    expect((await api.rows('ds')).map((p) => p.id)).toEqual(['p1']);
    const bs = await api.blocks('p1');
    expect(docText(bs.map(fromNotion))).toBe('T\ndentro');
    // Solo consulta: GET de bloques y la consulta (POST) de la fuente de datos, que en Notion es de lectura.
    expect(calls.every((c) => c.method === 'GET' || c.url.endsWith('/query'))).toBe(true);
  });
  test('propiedades: texto, selección y fecha; lo vacío es null', () => {
    expect(propValue({ type: 'title', title: [{ plain_text: 'Ana' }] }).text).toBe('Ana');
    expect(propValue({ type: 'select', select: null }).text).toBeNull();
    expect(propValue({ type: 'date', date: { start: '2026-06-17', end: null } })).toEqual({ text: '2026-06-17', start: '2026-06-17', end: null });
    expect(propValue({ type: 'rich_text', rich_text: [] }).text).toBeNull();
  });
});

describe('el plan de la importación', async () => {
  const { splitTitle, defaultKind, defaultInclude, defaultColumns, withKinds, cellFor, COFUNDO_KINDS } = await import('./plan');
  test('el título: empresa y personas, solo con lo que dice', () => {
    expect(splitTitle('Ana Pérez — Acme')).toEqual({ name: 'Acme', people: ['Ana Pérez'] });
    expect(splitTitle('Luis Gil / Fondo Norte Ventures')).toEqual({ name: 'Fondo Norte Ventures', people: ['Luis Gil'] });
    expect(splitTitle('🪙 Grupo Sur (Ana · Luis · Eva)')).toEqual({ name: 'Grupo Sur', people: ['Ana', 'Luis', 'Eva'] });
    expect(splitTitle('Fiesta Sur (Fiesta Grande)')).toEqual({ name: 'Fiesta Sur (Fiesta Grande)', people: ['Fiesta Sur (Fiesta Grande)'].filter(() => false) });
    expect(splitTitle('Marta Ruiz')).toEqual({ name: 'Marta Ruiz', people: ['Marta Ruiz'] });
    expect(splitTitle('Acme')).toEqual({ name: 'Acme', people: [] });
  });
  test('el tipo y si entra, con «Tipo» y «Origen»', () => {
    expect(defaultKind('Cliente', 'Consultoría dev')).toBe('cliente-desarrollo');
    expect(defaultKind('Cliente', 'Mío')).toBe('company');
    expect(defaultKind('Partner / Aliado', 'Enjoy the Club')).toBe('alianza');
    expect(defaultKind('Institucional / Ecosistema', 'Enjoy the Club')).toBe('ecosistema');
    expect(defaultKind('Asesor', null)).toBe('asesor');
    expect(defaultInclude('Cliente', 'Enjoy the Club')).toBe(false);
    expect(defaultInclude('Cliente', 'Oquea')).toBe(false);
    expect(defaultInclude('Partner / Aliado', 'Enjoy the Club')).toBe(true);
    expect(defaultInclude('Cliente', 'Mío')).toBe(true);
  });
  test('columnas: próximo paso a su sitio; selecciones con sus valores; textos largos; título como «Nombre en Notion»', () => {
    const row = (props: Record<string, { type: string; text: string | null; start?: string | null }>) => ({ pageId: 'p', url: 'u', createdTime: '', lastEditedTime: '', props });
    const cols = defaultColumns([
      row({ Cliente: { type: 'title', text: 'A' }, Etapa: { type: 'select', text: 'Lead' }, Origen: { type: 'select', text: 'Mío' }, 'Próximo paso': { type: 'rich_text', text: 'x' },
        'Fecha próximo paso': { type: 'date', text: '2026-06-17', start: '2026-06-17' }, 'Último contacto': { type: 'date', text: null }, 'Cómo entró': { type: 'rich_text', text: 'y' } }),
      row({ Cliente: { type: 'title', text: 'B' }, Etapa: { type: 'select', text: 'Negociación' } }),
    ]);
    expect(cols).toMatchObject({
      Cliente: { to: 'field', label: 'Nombre en Notion', type: 'text' }, Etapa: { to: 'field', type: 'select', options: ['Lead', 'Negociación'] },
      Origen: { to: 'field', label: 'Vehículo' }, 'Próximo paso': { to: 'nextStep' }, 'Fecha próximo paso': { to: 'nextStepAt' },
      'Último contacto': { to: 'field', type: 'date' }, 'Cómo entró': { to: 'field', type: 'long_text' },
    });
    expect(cellFor({ type: 'date', text: '2026-06-17', start: '2026-06-17', end: null })).toBe('2026-06-17');
    expect(cellFor({ type: 'rich_text', text: null })).toBe('');
  });
  test('tipos de Cofundo: se añaden los que faltan y el principal se renombra solo si sigue de serie', () => {
    const k = withKinds([{ key: 'company', label: 'Empresa', plural: 'Empresas', icon: 'building2', profile: 'venue' }]);
    expect(k.map((x) => x.key)).toEqual(COFUNDO_KINDS.map((x) => x.key));
    expect(k[0].label).toBe('Startup');
    const mine = withKinds([{ key: 'company', label: 'Centro', plural: 'Centros', icon: 'anchor', profile: 'venue' }, { key: 'alianza', label: 'Socio', plural: 'Socios', icon: 'users', profile: 'promoter' }]);
    expect(mine[0].label).toBe('Centro');
    expect(mine.find((x) => x.key === 'alianza')!.label).toBe('Socio');
  });
});

describe('importar desde Notion, de punta a punta (demo, base inventada)', async () => {
  const { contextAs } = await import('../admin/auth');
  const { publicRepository } = await import('../data');
  const { demoDb, resetDemoDb } = await import('../data/store');
  const { fixtureNotion } = await import('./server');
  const { createNotionImport, pageRef } = await import('./service');
  const SUPER = '99999999-9999-4999-8999-0000000000aa';
  const ADMIN = '22222222-2222-4222-8222-222222222222';
  const ctx = async (u: string) => (await contextAs((await publicRepository().resolveTenantBySlug('enjoy'))!, u))!;

  test('solo el superadmin', async () => {
    resetDemoDb();
    await expect(createNotionImport(await ctx(ADMIN), { api: fixtureNotion() }).start({ url: 'https://www.notion.so/0123456789abcdef0123456789abcdef' })).rejects.toMatchObject({ status: 403 });
  });

  test('leer, revisar, importar, verificar y deshacer', async () => {
    resetDemoDb();
    const admin = await ctx(SUPER);
    const n = createNotionImport(admin, { api: fixtureNotion() });
    const { id } = await n.start({ url: 'https://www.notion.so/0123456789abcdef0123456789abcdef' });
    let v = await n.view(id);
    expect(v.data.rows).toHaveLength(3);
    // Lo propuesto: la startup y la alianza entran; el cliente de Enjoy, no.
    expect(v.data.choices.map((c) => [c.include, c.kind, c.name, c.people])).toEqual([
      [true, 'company', 'Startup Demo', ['Marta Prueba']], [true, 'alianza', 'Fondo Demo Capital', []], [false, 'company', 'Sala Ejemplo (Sala Ejemplo Club)', []],
    ]);
    await expect(n.run(id)).rejects.toMatchObject({ status: 409 }); // falta leer las páginas
    for (let i = 0; i < 3; i++) await n.read(id, i);
    // El fondo, como inversor.
    await n.setChoices(id, [{}, { kind: 'inversor' }, {}]);
    const r = await n.run(id);
    expect(r).toMatchObject({ accounts: 2, people: 1, docs: 2, skipped: 0 });
    // 2 de la bitácora de la startup (la de mediados de octubre, no) + 2 del historial del fondo (la del 23 abr, con el año de la anterior).
    expect(r.activities).toBe(4);
    const byRef = await admin.crm.accountsByRef();
    const startup = byRef.get(pageRef('00000000-0000-4000-8000-00000000d511'))!;
    expect(startup).toMatchObject({ name: 'Startup Demo', kind: 'company', nextStep: 'Enviar la propuesta revisada' });
    const fondo = byRef.get(pageRef('00000000-0000-4000-8000-00000000d512'))!;
    expect(fondo.kind).toBe('inversor');
    expect((await admin.accounts.kinds()).map((k) => k.key)).toEqual(expect.arrayContaining(['company', 'inversor', 'alianza', 'cliente-desarrollo', 'asesor', 'ecosistema']));
    const doc = await admin.crm.accountDoc(startup.id);
    expect(doc?.blocks.some((b) => b.type === 'table')).toBe(true);
    const tl = await admin.crm.timeline(startup.id);
    expect(tl.items.filter((x) => x.dateOnly).map((x) => x.happenedAt.slice(0, 10)).sort()).toEqual(['2026-10-02', '2026-10-14']);
    // La verificación contra Notion: todo igual.
    for (let i = 0; i < 3; i++) expect((await n.verify(id, i, null)).diffs).toEqual([]);
    // Si algo no está, lo dice.
    demoDb().account.find((a) => a.id === startup.id)!.next_step = 'otra cosa';
    expect((await n.verify(id, 0, null)).diffs.join(' ')).toContain('Próximo paso');
    // Deshacer: fuera las empresas, sus personas, su cuerpo y sus interacciones.
    await n.undo(id);
    expect((await admin.crm.accountsByRef()).has(pageRef('00000000-0000-4000-8000-00000000d511'))).toBe(false);
    expect(demoDb().crm_activity.filter((a) => a.import_id === id)).toHaveLength(0);
    v = await n.view(id);
    expect(v.imp.status).toBe('undone');
  });
});
