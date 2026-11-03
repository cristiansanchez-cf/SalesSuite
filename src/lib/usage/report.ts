/**
 * El coste por empresa del mes (docs/COSTES.md), a partir de lo apuntado (platform_usage), lo que ocupa cada espacio
 * (platform_storage) y los costes fijos de la plataforma (PLATFORM_FIXED_COSTS), que se reparten por personas.
 */
import { env } from '../env';
import type { UsageProvider } from './meter';
import { DEFAULT_AI_PER_USER_DAY, type TenantLimits } from './limits';

export interface UsageRow {
  tenantId: string | null; day: string; feature: string; provider: UsageProvider; model: string | null; userId: string | null; userName: string | null;
  events: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; webSearches: number; units: number; costUsd: number;
}
export interface StorageRow { tenantId: string; objects: number; bytes: number }
export interface CostTenantInfo { id: string; slug: string; name: string; members: number; domain: string | null }

export type CostGroup = 'ai' | 'audio' | 'whatsapp' | 'email' | 'media';
export const GROUPS: CostGroup[] = ['ai', 'audio', 'whatsapp', 'email', 'media'];
const GROUP_OF: Record<UsageProvider, CostGroup> = { anthropic: 'ai', openai: 'audio', meta: 'whatsapp', email: 'email', media: 'media', other: 'ai' };

export interface FeatureCost { feature: string; group: CostGroup; events: number; inputTokens: number; outputTokens: number; webSearches: number; units: number; cost: number; perEvent: number }
export interface UserCost { userId: string | null; name: string | null; events: number; cost: number }
export interface TenantCost extends CostTenantInfo {
  variable: number; byGroup: Record<CostGroup, number>; byFeature: FeatureCost[]; byUser: UserCost[]; daily: number[];
  storageBytes: number; storageUsd: number; fixedShare: number; total: number; projected: number; perMember: number | null;
  /** Su tope de IA (el de por defecto si no tiene) y cuánto lleva de su gasto del mes (0-1; null sin tope de gasto). */
  limits: TenantLimits & { custom: boolean }; budgetUsed: number | null;
}
export interface CostReport {
  month: string; days: string[]; elapsedDays: number; current: boolean;
  fixed: Array<{ name: string; usd: number }>; storagePerGb: number;
  totals: { variable: number; storage: number; fixed: number; total: number; projected: number };
  tenants: TenantCost[];
  /** Lo gastado sin espacio (p. ej. un espacio ya borrado). */
  unassigned: number;
}

/** «Vercel=20, Supabase=25» → [{ name: 'Vercel', usd: 20 }, …] (dólares al mes). */
export function parseFixedCosts(raw: string | null | undefined): Array<{ name: string; usd: number }> {
  return String(raw ?? '').split(',').map((x) => x.split('=')).flatMap(([n, v]) => {
    const name = (n ?? '').trim().slice(0, 40), val = (v ?? '').trim(), usd = Number(val.replace(',', '.'));
    return name && val && Number.isFinite(usd) && usd >= 0 ? [{ name, usd }] : [];
  });
}
export const fixedCostsFromEnv = () => parseFixedCosts(env('PLATFORM_FIXED_COSTS'));
/** Supabase: 0,021 $ por GB al mes (lo que pase de lo incluido en el plan). */
export const storagePerGbFromEnv = () => { const v = Number(env('USAGE_PRICE_STORAGE_GB')); return env('USAGE_PRICE_STORAGE_GB') && Number.isFinite(v) && v >= 0 ? v : 0.021; };

/** El mes «2026-11»: sus días y el intervalo para pedirlo (con margen: el día que cuenta es el de Madrid). */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const days = Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  return { days, from: new Date(Date.UTC(y, m - 1, 1) - 3 * 3_600_000), to: new Date(Date.UTC(y, m, 1) + 3 * 3_600_000) };
}
export const isMonth = (v: unknown): v is string => typeof v === 'string' && /^20\d\d-(0[1-9]|1[0-2])$/.test(v);
export const monthOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export function costReport(o: {
  rows: UsageRow[]; storage: StorageRow[]; tenants: CostTenantInfo[]; month: string; now: Date;
  fixed?: Array<{ name: string; usd: number }>; storagePerGb?: number; limits?: Map<string, TenantLimits>;
}): CostReport {
  const { days } = monthRange(o.month);
  const today = dayOf(o.now);
  const current = monthOf(o.now) === o.month;
  const elapsedDays = current ? days.filter((d) => d <= today).length : days.length;
  const fixed = o.fixed ?? [];
  const perGb = o.storagePerGb ?? 0.021;
  const rows = o.rows.filter((r) => r.day.startsWith(o.month));
  const fixedTotal = fixed.reduce((s, x) => s + x.usd, 0);
  const people = o.tenants.reduce((s, t) => s + Math.max(0, t.members), 0);
  const known = new Set(o.tenants.map((t) => t.id));
  // Si el mes está en curso, lo que vaya a costar al final al ritmo de lo que va de mes.
  const project = (v: number) => (current && elapsedDays > 0 ? (v / elapsedDays) * days.length : v);

  const tenants = o.tenants.map((t): TenantCost => {
    const mine = rows.filter((r) => r.tenantId === t.id);
    const byGroup = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<CostGroup, number>;
    const features = new Map<string, FeatureCost>();
    const users = new Map<string, UserCost>();
    const daily = days.map(() => 0);
    for (const r of mine) {
      const g = GROUP_OF[r.provider] ?? 'ai';
      byGroup[g] += r.costUsd;
      const f = features.get(r.feature) ?? { feature: r.feature, group: g, events: 0, inputTokens: 0, outputTokens: 0, webSearches: 0, units: 0, cost: 0, perEvent: 0 };
      f.events += r.events; f.inputTokens += r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens; f.outputTokens += r.outputTokens;
      f.webSearches += r.webSearches; f.units += r.units; f.cost += r.costUsd;
      features.set(r.feature, f);
      const uk = r.userId ?? '-';
      const u = users.get(uk) ?? { userId: r.userId, name: r.userName, events: 0, cost: 0 };
      u.events += r.events; u.cost += r.costUsd; u.name ??= r.userName;
      users.set(uk, u);
      const i = days.indexOf(r.day);
      if (i >= 0) daily[i] += r.costUsd;
    }
    const variable = GROUPS.reduce((s, g) => s + byGroup[g], 0);
    const st = o.storage.find((s) => s.tenantId === t.id);
    const storageBytes = st?.bytes ?? 0;
    const storageUsd = (storageBytes / 1024 ** 3) * perGb;
    const fixedShare = people > 0 ? (fixedTotal * Math.max(0, t.members)) / people : o.tenants.length ? fixedTotal / o.tenants.length : 0;
    const projected = project(variable) + storageUsd + fixedShare;
    const own = o.limits?.get(t.id);
    const limits = { aiPerUserDay: own?.aiPerUserDay ?? DEFAULT_AI_PER_USER_DAY, aiMonthUsd: own?.aiMonthUsd ?? null, custom: !!own };
    return {
      ...t, variable, byGroup, daily, storageBytes, storageUsd, fixedShare, limits,
      budgetUsed: limits.aiMonthUsd === null ? null : limits.aiMonthUsd > 0 ? variable / limits.aiMonthUsd : 1,
      byFeature: [...features.values()].map((f) => ({ ...f, perEvent: f.events ? f.cost / f.events : 0 })).sort((a, b) => b.cost - a.cost),
      byUser: [...users.values()].sort((a, b) => b.cost - a.cost),
      total: variable + storageUsd + fixedShare,
      projected,
      perMember: t.members > 0 ? projected / t.members : null,
    };
  }).sort((a, b) => b.variable - a.variable || b.total - a.total);

  const variable = tenants.reduce((s, t) => s + t.variable, 0);
  const storage = tenants.reduce((s, t) => s + t.storageUsd, 0);
  return {
    month: o.month, days, elapsedDays, current, fixed, storagePerGb: perGb,
    totals: { variable, storage, fixed: fixedTotal, total: variable + storage + fixedTotal, projected: project(variable) + storage + fixedTotal },
    tenants,
    unassigned: rows.filter((r) => !r.tenantId || !known.has(r.tenantId)).reduce((s, r) => s + r.costUsd, 0),
  };
}

/** Dólares: con más decimales cuando son céntimos (una llamada a Haiku cuesta décimas de céntimo). */
export function usd(n: number, locale = 'es-ES'): string {
  const v = Math.abs(n);
  const digits = v === 0 ? 2 : v < 0.01 ? 4 : v < 1 ? 3 : 2;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: v === 0 ? 0 : Math.min(2, digits), maximumFractionDigits: digits }).format(n);
}
