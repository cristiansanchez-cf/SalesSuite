/**
 * Entrada de ingresos (docs/COMMISSIONS.md §1): eventos en nuestro formato o de APIs externas vía conector.
 * Idempotente: el mismo (origen, external_id) con los mismos datos se ignora; con datos distintos se rechaza.
 */
import type { EventInsert, IngestDb } from './db';
import { mulDivRound } from './money';
import { eventInput, type EventInput } from './schema';
import type { RevenueEvent } from './types';

export interface IngestResult {
  created: number;
  duplicates: number;
  conflicts: Array<{ external_id: string; message: string }>;
  errors: Array<{ index: number; message: string }>;
}
export const MAX_BATCH = 1000;

const same = (a: RevenueEvent, b: EventInsert) =>
  a.kind === b.kind && Date.parse(a.occurredAt) === Date.parse(b.occurredAt) && a.amountCents === b.amountCents && a.revenueCents === b.revenueCents
  && a.currency === b.currency && (a.quantity ?? null) === (b.quantity ?? null) && (a.refundsEventId ?? null) === (b.refundsEventId ?? null);

export async function normalize(db: IngestDb, tenantId: string, source: string, e: EventInput, status: 'confirmed' | 'pending' = 'confirmed'): Promise<EventInsert> {
  const amount = e.amount_cents ?? e.amount ?? 0;
  let refundsEventId: string | null = null;
  let revenue = e.revenue_cents ?? e.revenue ?? (e.take_rate != null ? mulDivRound(amount, Math.round(e.take_rate * 100), 10_000) : null);
  if (e.kind === 'refund') {
    const orig = await db.findEvent(tenantId, source, e.refunds_external_id!);
    if (!orig) throw new Error(`No existe el ingreso ${e.refunds_external_id} que se devuelve`);
    if (orig.currency !== e.currency) throw new Error('La devolución debe ir en la misma moneda que el ingreso');
    refundsEventId = orig.id;
    // Sin `revenue`: la parte proporcional de lo que ingresó la empresa.
    revenue ??= orig.amountCents > 0 ? Math.min(orig.revenueCents, mulDivRound(orig.revenueCents, amount, orig.amountCents)) : 0;
  }
  const accountId = e.account_ref ? await db.accountByRef(tenantId, e.account_ref) : null;
  if (e.account_ref && !accountId) throw new Error(`No hay ninguna cuenta con la referencia ${e.account_ref}`);
  const sellerId = e.seller_email ? await db.userByEmail(tenantId, e.seller_email) : null;
  if (e.seller_email && !sellerId) throw new Error(`${e.seller_email} no está en el equipo`);
  return {
    source, externalId: e.external_id, kind: e.kind, status, occurredAt: new Date(e.occurred_at).toISOString(), amountCents: amount,
    revenueCents: revenue ?? amount, currency: e.currency, accountId, dossierId: null, sellerId, offer: e.offer ?? null, metric: e.metric ?? null,
    quantity: e.quantity ?? null, refundsEventId, note: e.note ?? null,
  };
}

export async function ingest(db: IngestDb, tenantId: string, source: string, items: unknown[]): Promise<IngestResult> {
  const r: IngestResult = { created: 0, duplicates: 0, conflicts: [], errors: [] };
  if (items.length > MAX_BATCH) { r.errors.push({ index: -1, message: `Máximo ${MAX_BATCH} eventos por petición` }); return r; }
  for (const [index, raw] of items.entries()) {
    const p = eventInput.safeParse(raw);
    if (!p.success) { r.errors.push({ index, message: p.error.issues.map((i) => `${i.path.join('.') || 'evento'}: ${i.message}`).join('; ') }); continue; }
    try {
      const ev = await normalize(db, tenantId, source, p.data);
      const prev = await db.findEvent(tenantId, source, ev.externalId);
      if (prev) {
        if (same(prev, ev)) r.duplicates++;
        else r.conflicts.push({ external_id: ev.externalId, message: 'Ya existe con otros datos: no se modifica dinero ya registrado. Envía una devolución y un evento nuevo.' });
        continue;
      }
      await db.insertEvent(tenantId, ev);
      r.created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/duplicate key/i.test(msg)) r.duplicates++;
      else r.errors.push({ index, message: msg.replace(/^\[supabase\]\s*/, '') });
    }
  }
  return r;
}

// ---------------------------------------------------------------- conectores
/**
 * Mapeo de un formato externo a eventos:
 *   { "items": "data.payments", "fields": { "external_id": "id", "kind": { "const": "volume" },
 *     "amount": { "path": "gross", "divide": 100 }, "take_rate": { "const": 3 }, "occurred_at": "created_at",
 *     "account_ref": { "path": "center.id", "prefix": "oquea:" } } }
 */
export type FieldSpec = string | { path?: string; const?: unknown; multiply?: number; divide?: number; prefix?: string };
export interface Mapping { items?: string; fields: Record<string, FieldSpec> }

export function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

const TEXT_FIELDS = new Set(['external_id', 'refunds_external_id', 'account_ref', 'offer', 'seller_email', 'note']);

export function applyMapping(mapping: Mapping, body: unknown): Record<string, unknown>[] {
  const list = mapping.items ? get(body, mapping.items) : body;
  const items = Array.isArray(list) ? list : list && typeof list === 'object' ? [list] : [];
  return items.map((it) => Object.fromEntries(Object.entries(mapping.fields).map(([k, raw]) => {
    const spec = typeof raw === 'string' ? { path: raw } : raw;
    let v = spec.const !== undefined ? spec.const : spec.path ? get(it, spec.path) : undefined;
    if (v != null && (spec.multiply || spec.divide)) {
      const n = Number(v);
      // Céntimos → euros (divide: 100) con 2 decimales exactos para que parseMoney no reciba ruido de coma flotante.
      v = Number.isFinite(n) ? (n * (spec.multiply ?? 1)) / (spec.divide ?? 1) : v;
      if (typeof v === 'number') v = v.toFixed(2);
    }
    if (v != null && spec.prefix) v = `${spec.prefix}${v}`;
    if (typeof v === 'number' && k === 'occurred_at') v = new Date(v > 1e12 ? v : v * 1000).toISOString();
    // Ids numéricos de la API externa → texto (nuestro formato los quiere como texto).
    if (typeof v === 'number' && TEXT_FIELDS.has(k)) v = String(v);
    return [k, v];
  }).filter(([, v]) => v !== undefined)));
}

export function parseMapping(json: unknown): Mapping {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('El mapeo debe ser un objeto JSON');
  const m = json as Mapping;
  if (!m.fields || typeof m.fields !== 'object') throw new Error('Falta «fields»');
  for (const k of ['external_id', 'kind', 'occurred_at']) if (!(k in m.fields)) throw new Error(`Falta el campo «${k}» en el mapeo`);
  return m;
}
