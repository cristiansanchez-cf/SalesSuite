/**
 * Importar con tu IA (docs/IMPORTAR_IA.md): el área de espera y el «Aplicar». Por debajo es la importación de
 * siempre (borrador → importar → deshacer entero), así que valen sus reglas: duplicados por referencia o por nombre +
 * ciudad, solo se rellenan huecos de lo que ya existe y las notas se suman.
 *  1. start: abre una importación (borrador) y devuelve a la IA el esquema del espacio (tipos, preguntas, reglas).
 *  2. send: una tanda (hasta 25). Cada empresa se valida y se responde fila a fila; misma referencia = se actualiza.
 *  3. status / finish: cuántas lleva, qué falló; «terminar» la deja lista para revisar (no aplica nada).
 *  4. apply (solo desde la app, una persona): empresas y datos con la importación de siempre; después, empresa a empresa,
 *     tipo, personas, interacciones con fecha, próximo paso y cualificación.
 *  5. undo: todo fuera (las empresas creadas, las personas, las interacciones; lo fusionado vuelve a como estaba).
 * Por ahora, solo quien puede importar (admin), como la importación por CSV.
 */
import type { AdminContext } from '../admin/auth';
import { AdminError } from '../admin/service';
import type { ImportMapping } from './types';
import { AI_COLUMNS, MAX_BATCH, MAX_ROWS, cleanRow, crmRef, csvOf, mergeRows, summary, type AiImportData, type AiRow, type RowCtx } from './ai-import';
import { validDive } from './diving';
import { validQual } from './priority';
import { qualQuestions } from './qual-labels';
import { requestLocale } from '../i18n/request';

const UUID = /^[0-9a-f-]{36}$/i;
type Mapping = ImportMapping & { ai?: AiImportData };
export const AI_PREFIX = 'IA · ';

export function createAiImport(admin: AdminContext) {
  async function load(id: string) {
    if (!UUID.test(String(id))) throw new AdminError(404, 'Importación no encontrada');
    const d = await admin.crm.importDraft(id);
    const m = d.imp.mapping as Mapping;
    if (!m.ai) throw new AdminError(404, 'Esta importación no es de la IA');
    return { imp: d.imp, mapping: m, data: m.ai };
  }
  async function ctx(): Promise<RowCtx> {
    const [kinds, pack] = await Promise.all([admin.accounts.kinds(), admin.crm.qualPack()]);
    return {
      kinds: kinds.map((k) => ({ key: k.key, label: k.label, plural: k.plural })),
      validQual: pack === 'diving' ? validDive : pack === 'nightlife' ? (k, v) => validQual(k, v) : () => false,
      today: new Date().toISOString().slice(0, 10),
    };
  }
  /** Guarda las filas (como CSV de la importación) y devuelve qué referencias ya están en el CRM y con cuál. */
  async function stage(id: string, mapping: Mapping, rows: AiRow[]) {
    await admin.crm.importReplace(id, csvOf(rows));
    const { plan } = await admin.crm.importPreview(id, mapping);
    const dupes = new Map<string, string>();
    const joined = new Map<string, string>();
    for (const a of plan.accounts) {
      const refs = a.rows.map((n) => rows[n - 2]?.ref).filter((x): x is string => !!x);
      if (a.existingId) for (const r of refs) dupes.set(r, a.name);
      // Dos de la tanda que son la misma empresa (mismo nombre y ciudad): se juntan.
      if (refs.length > 1) for (const r of refs.slice(1)) joined.set(r, rows[(a.rows[0] ?? 2) - 2]?.name ?? a.name);
    }
    return { dupes, joined };
  }

  /** Abre una importación. Devuelve su id y el esquema del espacio para la IA. */
  async function start(input: { label?: unknown }) {
    const label = String(input.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Mis clientes';
    // La importación de siempre necesita una fila para crearse; se sustituye con la primera tanda.
    const id = await admin.crm.importStart(`${AI_PREFIX}${label}`, 'Empresa\n(pendiente)', 'account');
    const draft = await admin.crm.importDraft(id);
    const base = draft.imp.mapping as ImportMapping;
    const columns = Object.fromEntries(Object.entries(AI_COLUMNS).map(([h, key]) => [h, { to: 'core' as const, key }]));
    const data: AiImportData = { label, rows: [], startedAt: new Date().toISOString(), finishedAt: null };
    await admin.crm.importPreview(id, { ...base, columns, values: {}, options: {}, tag: null, segmentId: null, overwrite: false, ai: data } as Mapping);
    return { id, schema: await schema() };
  }

  /** Lo que la IA necesita saber del CRM para no inventarse nada. */
  async function schema() {
    const [kinds, pack] = await Promise.all([admin.accounts.kinds(), admin.crm.qualPack()]);
    const locale = requestLocale();
    const quals = pack ? kinds.flatMap((k) => qualQuestions(k.profile ?? 'venue', {}, locale, 40, pack).map((q) => ({ tipo: k.key, campo: q.field, pregunta: q.question, valores: q.options.map((o) => o.v) }))) : [];
    // Las preguntas son por ficha: la misma pregunta en varios tipos sale una vez.
    const seen = new Set<string>();
    return {
      tipos: kinds.map((k) => ({ clave: k.key, nombre: k.label })),
      cualificacion: quals.filter((q) => (seen.has(q.campo) ? false : (seen.add(q.campo), true))),
      canales: ['phone', 'whatsapp', 'email', 'visit', 'meeting', 'instagram', 'linkedin', 'other'],
      max_por_tanda: MAX_BATCH,
    };
  }

  /** Una tanda: cada empresa validada; la respuesta, fila a fila. */
  async function send(id: string, items: unknown) {
    const { imp, mapping, data } = await load(id);
    if (imp.status !== 'draft') throw new AdminError(409, 'Esta importación ya se aplicó');
    const list = Array.isArray(items) ? items : [];
    if (!list.length) throw new AdminError(422, 'La tanda está vacía');
    if (list.length > MAX_BATCH) throw new AdminError(422, 'Como mucho 25 empresas por tanda');
    const c = await ctx();
    const ok: AiRow[] = [];
    const rejected: Array<{ posicion: number; error: string }> = [];
    list.forEach((raw, i) => { const r = cleanRow(raw, c); if (r.row) ok.push(r.row); else rejected.push({ posicion: i + 1, error: r.error! }); });
    const merged = mergeRows(data.rows, ok);
    if (merged.rows.length > MAX_ROWS) throw new AdminError(422, 'Como mucho 2000 empresas por importación: termina esta y abre otra');
    const next: AiImportData = { ...data, rows: merged.rows, finishedAt: null };
    const { dupes, joined } = await stage(id, { ...mapping, ai: next }, merged.rows);
    return {
      recibidas: ok.length, nuevas: merged.added, actualizadas: merged.updated,
      empresas: ok.map((r) => ({
        ref: r.ref, nombre: r.name,
        estado: joined.has(r.ref) ? 'se_junta' : dupes.has(r.ref) ? 'ya_existe' : 'nueva',
        ...(dupes.has(r.ref) ? { ya_en_el_crm: dupes.get(r.ref) } : {}), ...(joined.has(r.ref) ? { se_junta_con: joined.get(r.ref) } : {}),
        avisos: r.problems,
      })),
      rechazadas: rejected,
      total: summary(merged.rows, new Set(dupes.keys())),
    };
  }

  async function status(id: string) {
    const { imp, data } = await load(id);
    const dupes = imp.status === 'draft' && data.rows.length ? (await stage(id, imp.mapping as Mapping, data.rows)).dupes : new Map<string, string>();
    return {
      estado: imp.status === 'done' ? 'aplicada' : imp.status === 'undone' ? 'deshecha' : data.finishedAt ? 'lista_para_revisar' : 'abierta',
      total: summary(data.rows, new Set(dupes.keys())),
      con_avisos: data.rows.filter((r) => r.problems.length).slice(0, 50).map((r) => ({ ref: r.ref, nombre: r.name, avisos: r.problems })),
      refs: data.rows.map((r) => r.ref),
    };
  }

  /** La IA ha terminado: queda lista para revisar (no aplica nada). */
  async function finish(id: string) {
    const { imp, mapping, data } = await load(id);
    if (imp.status !== 'draft') throw new AdminError(409, 'Esta importación ya se aplicó');
    if (!data.rows.length) throw new AdminError(422, 'No hay empresas: manda al menos una tanda');
    await admin.crm.importPreview(id, { ...mapping, ai: { ...data, finishedAt: new Date().toISOString() } } as Mapping);
    return { review: `/admin/import/ia/${id}`, total: data.rows.length };
  }

  /** Aplicar (una persona, desde la app): la importación de siempre y, empresa a empresa, lo demás. */
  async function apply(id: string) {
    const { imp, mapping, data } = await load(id);
    if (imp.status !== 'draft') throw new AdminError(409, 'Esta importación ya se aplicó');
    if (!data.rows.length) throw new AdminError(422, 'No hay empresas que importar');
    const { dupes } = await stage(id, mapping, data.rows);
    // Los datos de las que ya estaban, a sus Notas (se deshacen); los de las nuevas, a «Lo que sabemos» (abajo).
    await admin.crm.importReplace(id, csvOf(data.rows, new Set(dupes.keys())));
    const stats = await admin.crm.importRun(id);
    const byRef = await admin.crm.accountsByRef();
    let people = 0, activities = 0, steps = 0, quals = 0, skipped = 0;
    for (const r of data.rows) {
      const acc = byRef.get(crmRef(r.ref));
      if (!acc) { skipped++; continue; }
      // Lo nuevo de esta importación se completa entero; lo que ya estaba, solo con lo que no pisa nada.
      const created = acc.importId === id;
      if (created && r.kind && r.kind !== acc.kind) await admin.crm.classifyAccount(acc.id, { kind: r.kind });
      // «Lo que sabemos», en su orden (cada uno se pone arriba: se añaden del último al primero).
      if (created) for (const fact of [...r.facts].reverse()) await admin.crm.factAdd(acc.id, fact).catch(() => null);
      const have = new Set((await admin.crm.company(acc.id)).people.map((p) => p.name.trim().toLowerCase()));
      people += await admin.crm.importPeople(id, r.people.filter((p) => !have.has(p.name.trim().toLowerCase())).map((p) => ({ accountId: acc.id, name: p.name, role: p.role, phone: p.phone, email: p.email })));
      activities += await admin.crm.importActivities(id, r.interactions.map((x) => ({ accountId: acc.id, channel: x.channel, note: x.note, happenedAt: `${x.date}T12:00:00.000Z`, dateOnly: true })));
      if (created && r.next) { await admin.crm.setNextStep(acc.id, { step: r.next.what, at: r.next.date ?? '' }).catch(() => null); steps++; }
      const q = (acc.qualification ?? {}) as Record<string, unknown>;
      for (const [k, raw] of Object.entries(r.qualification)) {
        if (!created && q[k] !== undefined) continue;   // no pisa lo marcado
        for (const v of raw.split(',')) { await admin.crm.qualify(acc.id, `${k}:${v}`, { add: true }).catch(() => null); quals++; }
      }
    }
    return { stats, people, activities, steps, quals, skipped };
  }

  async function undo(id: string) {
    await load(id);
    await admin.crm.undoImportActivities(id);
    return admin.crm.importUndo(id);
  }

  /** Para la pantalla de revisión. */
  async function view(id: string) {
    const { imp, data } = await load(id);
    const dupes = imp.status === 'draft' && data.rows.length ? (await stage(id, imp.mapping as Mapping, data.rows)).dupes : new Map<string, string>();
    return { imp: { id: imp.id, status: imp.status, stats: imp.stats, createdAt: imp.createdAt, doneAt: imp.doneAt, createdBy: imp.createdBy }, data, dupes, total: summary(data.rows, new Set(dupes.keys())) };
  }

  /** Las importaciones con la IA (las últimas). */
  async function list() {
    return (await admin.crm.imports()).filter((x) => x.fileName.startsWith(AI_PREFIX));
  }

  return { start, schema, send, status, finish, apply, undo, view, list };
}
export type AiImport = ReturnType<typeof createAiImport>;
