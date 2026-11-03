/**
 * Importar desde Notion (docs/CRM_DINAMICO.md §48), solo el superadmin. Pasos cortos (cada uno, una petición):
 * 1. start: lee la base (columnas y filas) y crea la importación (borrador).
 * 2. read: lee el cuerpo de una página (de una en una, desde el navegador).
 * 3. choices: lo decidido en la vista previa (qué filas entran, tipo, nombre de la empresa, personas).
 * 4. run: crea los tipos de Cofundo que falten, las empresas y sus campos (con la importación de siempre, que se deshace),
 *    y después el próximo paso, el tipo, las personas del título, el cuerpo de la página y las interacciones fechadas.
 * 5. verify: vuelve a leer cada página de Notion y lo compara con lo importado.
 * 6. undo: lo deshace todo (las empresas se llevan su cuerpo y sus interacciones).
 * Notion no se toca nunca: el cliente solo lee.
 */
import type { AdminContext } from '../admin/auth';
import { AdminError } from '../admin/service';
import type { CrmField } from '../crm/fields';
import type { ImportMapping, ColumnMap } from '../crm/types';
import { blockCounts, docText, fromNotion, textHash } from './doc';
import { extractEntries } from './entries';
import { NotionError, notionId, propValue, type NotionApi } from './client';
import { cellFor, defaultChoice, defaultColumns, withKinds, type NotionChoice, type NotionImportData, type NotionProp, type NotionRow } from './plan';

const UUID = /^[0-9a-f-]{36}$/i;
type Mapping = ImportMapping & { notion?: NotionImportData };
/** La referencia de una página en el CRM: estable y corta (la URL con el título cambia si se renombra). */
export const pageRef = (pageId: string) => `https://www.notion.so/${pageId.replace(/-/g, '')}`;

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

function notionFail(e: unknown): never {
  if (e instanceof NotionError) {
    if (e.status === 401) throw new AdminError(503, 'La clave de Notion (NOTION_TOKEN) no vale');
    if (e.status === 404 || e.code === 'object_not_found') throw new AdminError(404, 'No veo esa base: compártela con la integración de Notion (··· → Conexiones)');
    if (e.status === 413) throw new AdminError(422, e.message);
    throw new AdminError(503, `Notion no ha respondido bien (${e.status})`);
  }
  throw e;
}

export function createNotionImport(admin: AdminContext, deps: { api: NotionApi | null }) {
  const requireSuper = () => { if (!admin.session.superadmin) throw new AdminError(403, 'Solo el superadmin'); };
  const requireApi = () => { if (!deps.api) throw new AdminError(503, 'Falta NOTION_TOKEN en el servidor'); return deps.api; };

  async function load(id: string) {
    requireSuper();
    if (!UUID.test(id)) throw new AdminError(404, 'Importación no encontrada');
    const d = await admin.crm.importDraft(id);
    const m = d.imp.mapping as Mapping;
    if (!m.notion) throw new AdminError(404, 'Esta importación no es de Notion');
    return { imp: d.imp, mapping: m, data: m.notion };
  }
  async function save(id: string, mapping: Mapping) {
    // importPreview guarda el mapeo (con lo de Notion dentro) mientras es borrador.
    await admin.crm.importPreview(id, mapping);
  }
  /** Las columnas del CSV de la importación (sin las que van a su sitio: próximo paso). */
  const fieldColumns = (data: NotionImportData) => Object.entries(data.columns).filter(([, c]) => c.to === 'field') as Array<[string, Extract<NotionImportData['columns'][string], { to: 'field' }>]>;
  function csvOf(data: NotionImportData, only: number[]) {
    const cols = fieldColumns(data);
    const head = ['Empresa', 'Notion', ...cols.map(([, c]) => c.label)];
    const body = only.map((i) => [data.choices[i].name, pageRef(data.rows[i].pageId), ...cols.map(([k]) => cellFor(data.rows[i].props[k]))]);
    return csv([head, ...body]);
  }

  async function start(input: { url?: unknown }) {
    requireSuper();
    const api = requireApi();
    const dbId = notionId(String(input.url ?? ''));
    if (!dbId) throw new AdminError(422, 'Pega el enlace de la base de Notion');
    let title = '', dataSourceId = '', schema: Awaited<ReturnType<NotionApi['dataSource']>> = {};
    let pages: Awaited<ReturnType<NotionApi['rows']>> = [];
    try {
      const d = await api.database(dbId);
      if (!d.dataSources.length) throw new AdminError(422, 'Esa base no tiene datos');
      if (d.dataSources.length > 1) throw new AdminError(422, 'Esa base tiene varias fuentes de datos: de momento, una');
      title = d.title || 'Notion';
      dataSourceId = d.dataSources[0].id;
      schema = await api.dataSource(dataSourceId);
      pages = (await api.rows(dataSourceId)).filter((p) => !p.archived);
    } catch (e) { if (e instanceof AdminError) throw e; notionFail(e); }
    if (!pages.length) throw new AdminError(422, 'La base está vacía');
    const rows: NotionRow[] = pages.map((p) => ({
      pageId: p.id, url: p.url, createdTime: p.createdTime, lastEditedTime: p.lastEditedTime,
      props: Object.fromEntries(Object.entries(p.properties).map(([k, v]) => [k, { type: String((v as { type?: string }).type ?? ''), ...propValue(v) } as NotionProp])),
    }));
    const columns = defaultColumns(rows);
    // Las opciones en el orden de Notion (las etapas del embudo, tal cual), también las que nadie usa aún.
    for (const [k, c] of Object.entries(columns)) if (c.to === 'field' && (c.type === 'select' || c.type === 'multi_select') && schema[k]?.options) c.options = schema[k].options;
    const data: NotionImportData = { databaseId: dbId, dataSourceId, title, rows, choices: rows.map(defaultChoice), columns, readAt: new Date().toISOString() };
    const id = await admin.crm.importStart(`Notion · ${title}`.slice(0, 200), csvOf(data, rows.map((_, i) => i)), 'account');
    const draft = await admin.crm.importDraft(id);
    await save(id, { ...(draft.imp.mapping as ImportMapping), notion: data });
    return { id };
  }

  /** El cuerpo de una página: bloques, texto, huella y entradas fechadas. */
  async function read(id: string, index: number) {
    const { mapping, data } = await load(id);
    const api = requireApi();
    const r = data.rows[index];
    if (!r) throw new AdminError(422, 'Datos no válidos');
    try {
      const doc = (await api.blocks(r.pageId)).map(fromNotion);
      const text = docText(doc);
      Object.assign(r, { blocks: doc, chars: text.length, textHash: textHash(text), counts: blockCounts(doc), entries: extractEntries(doc), readError: null });
    } catch (e) {
      if (!(e instanceof NotionError)) throw e;
      r.readError = e.status === 413 ? e.message : `Notion ${e.status}`;
    }
    await save(id, mapping);
    return { index, chars: r.chars ?? 0, error: r.readError ?? null };
  }

  async function setChoices(id: string, input: unknown) {
    const { mapping, data } = await load(id);
    const list = Array.isArray(input) ? input : [];
    const kinds = withKinds(await admin.accounts.kinds()).map((k) => k.key);
    data.choices = data.rows.map((_, i) => {
      const c = (list[i] ?? {}) as Partial<NotionChoice>;
      const prev = data.choices[i];
      const name = String(c.name ?? prev.name).replace(/\s+/g, ' ').trim().slice(0, 160);
      const people = (Array.isArray(c.people) ? c.people : prev.people).map((p) => String(p).replace(/\s+/g, ' ').trim().slice(0, 160)).filter(Boolean).slice(0, 20);
      return { include: c.include === undefined ? prev.include : !!c.include, kind: kinds.includes(String(c.kind)) ? String(c.kind) : prev.kind, name: name || prev.name, people };
    });
    await save(id, mapping);
    return data.choices;
  }

  async function run(id: string) {
    const { mapping, data } = await load(id);
    const only = data.choices.map((c, i) => (c.include ? i : -1)).filter((i) => i >= 0);
    if (!only.length) throw new AdminError(422, 'No hay filas que importar');
    const unread = only.filter((i) => !data.rows[i].blocks);
    if (unread.length) throw new AdminError(409, 'Faltan páginas por leer: espera a que termine la lectura');
    // Los tipos de Cofundo que falten.
    const kindsNow = await admin.accounts.kinds();
    const kindsNext = withKinds(kindsNow);
    if (kindsNext.length !== kindsNow.length || kindsNext[0].label !== kindsNow[0].label) await admin.accounts.saveKinds(kindsNext);
    // Empresas y campos, con la importación de siempre (dedupe por la referencia de Notion; se deshace entera).
    await admin.crm.importReplace(id, csvOf(data, only));
    const existing = new Map((await admin.accounts.crmFields()).filter((f: CrmField) => f.target === 'account' && !f.archivedAt).map((f: CrmField) => [f.label.toLowerCase(), f]));
    const columns: Record<string, ColumnMap> = { Empresa: { to: 'core', key: 'name' }, Notion: { to: 'core', key: 'externalRef' } };
    const options: Record<string, string[]> = {};
    // Los valores de Notion, tal cual (sin esto, la importación unifica «A / B» como «A + B»).
    const values: Record<string, Record<string, string>> = {};
    for (const [, c] of fieldColumns(data)) {
      const f = existing.get(c.label.toLowerCase());
      columns[c.label] = f ? { to: 'field', key: f.key } : { to: 'new', label: c.label, type: c.type };
      if (c.options?.length) { options[c.label] = c.options; values[c.label] = Object.fromEntries(c.options.map((o) => [o, o])); }
    }
    const next: Mapping = { ...mapping, columns, values, options, tag: null, segmentId: null, overwrite: false, notion: data };
    await save(id, next);
    const stats = await admin.crm.importRun(id);
    // Lo de cada empresa nueva (las que ya estaban de otra vez, no se tocan: se ven en la verificación).
    const byRef = await admin.crm.accountsByRef();
    data.accountIds = data.rows.map(() => null);
    let people = 0, docs = 0, activities = 0, skipped = 0;
    for (const i of only) {
      const r = data.rows[i], c = data.choices[i];
      const acc = byRef.get(pageRef(r.pageId));
      if (!acc || acc.importId !== id) { skipped++; continue; }
      data.accountIds[i] = acc.id;
      await admin.crm.classifyAccount(acc.id, { kind: c.kind });
      const stepCol = Object.entries(data.columns).find(([, x]) => x.to === 'nextStep')?.[0];
      const atCol = Object.entries(data.columns).find(([, x]) => x.to === 'nextStepAt')?.[0];
      const step = stepCol ? r.props[stepCol]?.text ?? null : null;
      const at = atCol ? r.props[atCol]?.start ?? null : null;
      if (step || at) await admin.crm.setNextStep(acc.id, { step: step ?? '', at: at ?? '' });
      people += await admin.crm.importPeople(id, c.people.map((name) => ({ accountId: acc.id, name })));
      const title = Object.values(r.props).find((p) => p.type === 'title')?.text ?? null;
      await admin.crm.saveAccountDoc({ accountId: acc.id, sourceUrl: r.url, title, blocks: r.blocks ?? [], chars: r.chars ?? 0, textHash: r.textHash ?? null, importId: id });
      docs++;
      const exact = (r.entries ?? []).filter((e) => e.kind === 'exact' && e.at && e.note.length <= 4000);
      activities += await admin.crm.importActivities(id, exact.map((e) => ({ accountId: acc.id, channel: e.channel, note: e.note, happenedAt: e.at!, dateOnly: e.dateOnly })));
    }
    // El resultado se guarda en la importación (ya no es borrador: se escribe con la sesión de servicio de import).
    return { stats, accounts: stats.accountsCreated, people, docs, activities, skipped, accountIds: data.accountIds };
  }

  /** Vuelve a leer una fila de Notion y la compara con lo importado. Devuelve las diferencias (vacío = igual). */
  async function verify(id: string, index: number, accountId: string | null) {
    const { data } = await load(id).catch(async () => {
      // Tras importar, la importación ya no es borrador: se lee igual.
      const d = await admin.crm.importDraft(id);
      return { imp: d.imp, mapping: d.imp.mapping as Mapping, data: (d.imp.mapping as Mapping).notion! };
    });
    const api = requireApi();
    const r = data.rows[index], c = data.choices[index];
    if (!r || !c) throw new AdminError(422, 'Datos no válidos');
    if (!c.include) return { index, skipped: true, diffs: [] as string[] };
    const diffs: string[] = [];
    const acc = accountId ? (await admin.accounts.get(accountId).catch(() => null))?.account ?? null : (await admin.crm.accountsByRef()).get(pageRef(r.pageId)) ?? null;
    if (!acc) return { index, skipped: false, diffs: ['No está en el CRM'] };
    // Lo de Notion, ahora.
    let page: Awaited<ReturnType<NotionApi['rows']>>[number] | undefined;
    let blocks: ReturnType<typeof fromNotion>[] = [];
    try {
      page = (await api.rows(data.dataSourceId)).find((p) => p.id === r.pageId);
      blocks = (await api.blocks(r.pageId)).map(fromNotion);
    } catch (e) { notionFail(e); }
    if (!page) return { index, skipped: false, diffs: ['Ya no está en Notion'] };
    const fields = new Map((await admin.accounts.crmFields()).map((f: CrmField) => [f.key, f]));
    const byLabel = new Map([...fields.values()].map((f) => [f.label.toLowerCase(), f]));
    for (const [k, col] of Object.entries(data.columns)) {
      const p = { type: String(page.properties[k]?.type ?? ''), ...propValue(page.properties[k]) } as NotionProp;
      const want = cellFor(p);
      if (col.to === 'nextStep') { if ((acc.nextStep ?? '') !== want) diffs.push(`${k}: en Notion «${want.slice(0, 60)}», en el CRM «${(acc.nextStep ?? '').slice(0, 60)}»`); continue; }
      if (col.to === 'nextStepAt') {
        const got = acc.nextStepAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(acc.nextStepAt)) : '';
        if (got !== (p.start ?? '').slice(0, 10)) diffs.push(`${k}: en Notion ${p.start ?? '—'}, en el CRM ${got || '—'}`);
        continue;
      }
      if (col.to !== 'field') continue;
      const f = byLabel.get(col.label.toLowerCase());
      if (!f) { if (want) diffs.push(`${col.label}: falta el campo`); continue; }
      const raw = acc.fields[f.key];
      const got = raw == null ? '' : Array.isArray(raw) ? raw.map((x) => f.options.find((o) => o.key === x)?.label ?? x).join(', ')
        : f.type === 'select' ? f.options.find((o) => o.key === raw)?.label ?? String(raw) : String(raw);
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      if (norm(got) !== norm(want)) diffs.push(`${col.label}: en Notion «${want.slice(0, 60)}», en el CRM «${got.slice(0, 60)}»`);
    }
    if (acc.name !== c.name) diffs.push(`Nombre: «${acc.name}» (se esperaba «${c.name}»)`);
    if (acc.kind !== c.kind) diffs.push(`Tipo: ${acc.kind} (se esperaba ${c.kind})`);
    // El cuerpo: misma huella de texto y mismos bloques.
    const doc = await admin.crm.accountDoc(acc.id);
    const text = docText(blocks);
    if (!doc) diffs.push('Falta el cuerpo de la página');
    else {
      if (doc.textHash !== textHash(text)) diffs.push(`El cuerpo no coincide: en Notion ${text.length} caracteres, en el CRM ${doc.chars}`);
      const a = blockCounts(blocks), b = blockCounts(doc.blocks);
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if ((a[k] ?? 0) !== (b[k] ?? 0)) diffs.push(`Bloques «${k}»: en Notion ${a[k] ?? 0}, en el CRM ${b[k] ?? 0}`);
    }
    // Las interacciones: una por cada entrada con fecha exacta.
    const want = extractEntries(blocks).filter((e) => e.kind === 'exact' && e.note.length <= 4000).map((e) => e.note.slice(0, 4000));
    const tl = await admin.crm.timeline(acc.id);
    const have = new Set(tl.items.map((x) => x.note ?? ''));
    const missing = want.filter((n) => !have.has(n));
    if (missing.length) diffs.push(`Faltan ${missing.length} de ${want.length} interacciones de la bitácora`);
    return { index, skipped: false, diffs };
  }

  async function undo(id: string) {
    requireSuper();
    await admin.crm.undoImportActivities(id);
    return admin.crm.importUndo(id);
  }

  /** Para la pantalla: la importación con su vista previa. */
  async function view(id: string) {
    requireSuper();
    const d = await admin.crm.importDraft(id);
    const m = d.imp.mapping as Mapping;
    if (!m.notion) throw new AdminError(404, 'Esta importación no es de Notion');
    return { imp: { id: d.imp.id, status: d.imp.status, stats: d.imp.stats, createdAt: d.imp.createdAt, fileName: d.imp.fileName }, data: m.notion, kinds: withKinds(await admin.accounts.kinds()) };
  }

  return { start, read, setChoices, run, verify, undo, view };
}
export type NotionImport = ReturnType<typeof createNotionImport>;
