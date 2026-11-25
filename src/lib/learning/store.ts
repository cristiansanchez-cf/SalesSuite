/**
 * Aprender de las conversaciones (docs/APRENDIZAJE.md): cada mensaje con el asistente (WhatsApp y MCP) y los informes
 * que saca la IA cada pocos días. Solo el servidor escribe (clave de servicio); solo el superadmin lo ve. Nunca debe
 * romper una conversación: si no se puede guardar, se avisa en el log y sigue.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from '../env';
import { appMode } from '../mode';

export type LogDir = 'in' | 'out' | 'mcp' | 'error';
export interface LogRow { tenantId: string | null; userId: string | null; dir: LogDir; kind: string; text: string; step?: string | null; meta?: Record<string, unknown>; at?: string }
export interface LogEntry extends Required<Omit<LogRow, 'meta'>> { id: string; meta: Record<string, unknown>; userName: string | null; tenantName: string | null }
export interface Review {
  id: string; createdAt: string; periodFrom: string; periodTo: string; conversations: number; messages: number;
  metrics: Record<string, unknown>; report: ReviewReport | null; model: string | null; error: string | null;
}
export interface Finding {
  title: string; kind: 'bug' | 'confusion' | 'missing' | 'ux' | 'works'; severity: 'high' | 'medium' | 'low';
  times: number; people: number; what: string; examples: Array<{ who: string; quote: string }>; cause: string; proposal: string;
}
export interface ReviewReport { summary: string; findings: Finding[]; usage: string[] }
export interface LearningStore {
  add(rows: LogRow[]): Promise<void>;
  list(o: { from: string; to?: string; userId?: string; limit: number }): Promise<LogEntry[]>;
  people(from: string): Promise<Array<{ userId: string; name: string | null; messages: number }>>;
  saveReview(r: Omit<Review, 'id' | 'createdAt'>): Promise<string>;
  reviews(limit: number): Promise<Review[]>;
  purge(before: string): Promise<void>;
}

/** Desactivable (ASSISTANT_LEARNING=0): sin guardar nada ni revisar. */
export const learningOn = () => env('ASSISTANT_LEARNING') !== '0';
export const RETENTION_DAYS = 90;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const clean = (r: LogRow) => ({ ...r, kind: clip(r.kind || 'text', 60), text: clip(r.text ?? '', 12000), step: r.step ? clip(r.step, 60) : null });

const MEM = Symbol.for('salessuite.learning');
type Mem = { logs: LogEntry[]; reviews: Review[]; names: Map<string, string> };
type G = typeof globalThis & { [MEM]?: Mem };
export const demoLearning = (): Mem => ((globalThis as G)[MEM] ??= { logs: [], reviews: [], names: new Map() });
export function resetDemoLearning() { (globalThis as G)[MEM] = { logs: [], reviews: [], names: new Map() }; }

export function demoLearningStore(): LearningStore {
  const m = demoLearning;
  // En la demo, los nombres de la base de datos de memoria.
  void import('../data/store').then(({ demoDb }) => { for (const u of demoDb().users) m().names.set(u.id, u.display_name || u.email); }).catch(() => {});
  return {
    async add(rows) {
      for (const r of rows.map(clean)) m().logs.push({ id: crypto.randomUUID(), at: r.at ?? new Date().toISOString(), tenantId: r.tenantId, userId: r.userId, dir: r.dir, kind: r.kind, text: r.text, step: r.step ?? null, meta: r.meta ?? {}, userName: r.userId ? m().names.get(r.userId) ?? null : null, tenantName: null });
    },
    async list(o) {
      return m().logs.filter((x) => x.at >= o.from && (!o.to || x.at <= o.to) && (!o.userId || x.userId === o.userId)).sort((a, b) => a.at.localeCompare(b.at)).slice(-o.limit);
    },
    async people(from) {
      const by = new Map<string, number>();
      for (const x of m().logs) if (x.at >= from && x.userId) by.set(x.userId, (by.get(x.userId) ?? 0) + 1);
      return [...by].map(([userId, messages]) => ({ userId, name: m().names.get(userId) ?? null, messages })).sort((a, b) => b.messages - a.messages);
    },
    async saveReview(r) { const id = crypto.randomUUID(); m().reviews.unshift({ ...r, id, createdAt: new Date().toISOString() }); return id; },
    async reviews(limit) { return m().reviews.slice(0, limit); },
    async purge(before) { m().logs = m().logs.filter((x) => x.at >= before); },
  };
}

type Row = Record<string, unknown>;
export function learningStore(): LearningStore | null {
  if (!learningOn()) return null;
  if (appMode() === 'demo') return demoLearningStore();
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const url = env('PUBLIC_SUPABASE_URL');
  if (!key || !url) return null;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const names = async (ids: string[]) => {
    const u = [...new Set(ids.filter(Boolean))];
    if (!u.length) return new Map<string, string>();
    const r = await sb.from('users').select('id, display_name, email').in('id', u);
    return new Map(((r.data ?? []) as Row[]).map((x) => [x.id as string, String(x.display_name || x.email || '')]));
  };
  const tenants = async (ids: string[]) => {
    const u = [...new Set(ids.filter(Boolean))];
    if (!u.length) return new Map<string, string>();
    const r = await sb.from('tenant').select('id, name').in('id', u);
    return new Map(((r.data ?? []) as Row[]).map((x) => [x.id as string, String(x.name ?? '')]));
  };
  const toReview = (x: Row): Review => ({
    id: x.id as string, createdAt: x.created_at as string, periodFrom: x.period_from as string, periodTo: x.period_to as string,
    conversations: Number(x.conversations ?? 0), messages: Number(x.messages ?? 0), metrics: (x.metrics as Record<string, unknown>) ?? {},
    report: x.report && Object.keys(x.report as object).length ? (x.report as ReviewReport) : null, model: (x.model as string) ?? null, error: (x.error as string) ?? null,
  });
  return {
    async add(rows) {
      if (!rows.length) return;
      const r = await sb.from('assistant_log').insert(rows.map(clean).map((x) => ({
        tenant_id: x.tenantId, user_id: x.userId, dir: x.dir, kind: x.kind, text: x.text, step: x.step, meta: x.meta ?? {}, ...(x.at ? { at: x.at } : {}),
      })));
      if (r.error) console.warn('[learning] add', r.error.message);
    },
    async list(o) {
      let q = sb.from('assistant_log').select('*').gte('at', o.from).order('at', { ascending: false }).limit(o.limit);
      if (o.to) q = q.lte('at', o.to);
      if (o.userId) q = q.eq('user_id', o.userId);
      const r = await q;
      if (r.error) throw new Error(r.error.message);
      const rows = ((r.data ?? []) as Row[]).reverse();
      const [n, t] = await Promise.all([names(rows.map((x) => x.user_id as string)), tenants(rows.map((x) => x.tenant_id as string))]);
      return rows.map((x) => ({
        id: x.id as string, at: x.at as string, tenantId: (x.tenant_id as string) ?? null, userId: (x.user_id as string) ?? null, dir: x.dir as LogDir, kind: x.kind as string,
        text: x.text as string, step: (x.step as string) ?? null, meta: (x.meta as Record<string, unknown>) ?? {},
        userName: n.get(x.user_id as string) ?? null, tenantName: t.get(x.tenant_id as string) ?? null,
      }));
    },
    async people(from) {
      const r = await sb.from('assistant_log').select('user_id').gte('at', from).limit(20000);
      const by = new Map<string, number>();
      for (const x of (r.data ?? []) as Row[]) if (x.user_id) by.set(x.user_id as string, (by.get(x.user_id as string) ?? 0) + 1);
      const n = await names([...by.keys()]);
      return [...by].map(([userId, messages]) => ({ userId, name: n.get(userId) ?? null, messages })).sort((a, b) => b.messages - a.messages);
    },
    async saveReview(x) {
      const r = await sb.from('assistant_review').insert({ period_from: x.periodFrom, period_to: x.periodTo, conversations: x.conversations, messages: x.messages, metrics: x.metrics, report: x.report ?? {}, model: x.model, error: x.error }).select('id').single();
      if (r.error) throw new Error(r.error.message);
      return (r.data as Row).id as string;
    },
    async reviews(limit) {
      const r = await sb.from('assistant_review').select('*').order('created_at', { ascending: false }).limit(limit);
      if (r.error) throw new Error(r.error.message);
      return ((r.data ?? []) as Row[]).map(toReview);
    },
    async purge(before) {
      const r = await sb.from('assistant_log').delete().lt('at', before);
      if (r.error) console.warn('[learning] purge', r.error.message);
    },
  };
}

/** Guarda sin esperar ni fallar (lo usa el asistente al contestar). */
export function logQuietly(store: LearningStore | null, rows: LogRow[]): Promise<void> {
  if (!store || !rows.length) return Promise.resolve();
  return store.add(rows).catch((e) => console.warn('[learning]', e instanceof Error ? e.message : e));
}
