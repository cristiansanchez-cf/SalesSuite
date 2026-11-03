/**
 * Consumo en demo (docs/COSTES.md): lo apuntado de verdad en esta demo (casi nada: la IA de pruebas no gasta) más un
 * mes de ejemplo, fijo, para ver el panel de costes. El segundo espacio gasta mucho más en IA: el caso de «se pone como
 * un loco a apuntar con IA».
 */
import { demoDb } from '../data/store';
import { demoUsage, type UsageEvent } from './meter';
import { claudeCost } from './prices';
import type { UsageRow } from './report';

const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
/** Pseudoaleatorio fijo (mismo resultado en cada arranque). */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
const AI: Array<{ feature: string; model: string; inT: number; outT: number; web?: number; perDay: number }> = [
  { feature: 'crm.notes', model: 'claude-haiku-5-5', inT: 6000, outT: 900, perDay: 6 },
  { feature: 'crm.research', model: 'claude-sonnet-5-5', inT: 45000, outT: 2500, web: 4, perDay: 1.2 },
  { feature: 'assistant.draft', model: 'claude-haiku-5-5', inT: 900, outT: 120, perDay: 3 },
  { feature: 'leads.classify', model: 'claude-haiku-5-5', inT: 700, outT: 150, perDay: 2 },
  { feature: 'crm.cleanup', model: 'claude-sonnet-5-5', inT: 20000, outT: 6000, perDay: 0.1 },
];

export function sampleEvents(now: Date): UsageEvent[] {
  const d = demoDb();
  const out: UsageEvent[] = [];
  const start = new Date(now.getTime() - 40 * 86_400_000);
  d.tenant.forEach((t, ti) => {
    const people = d.users.filter((u) => u.memberships.some((m) => m.tenant_id === t.id && m.role !== 'partner'));
    if (!people.length) return;
    const heavy = ti === 1 ? 6 : 1;
    for (let day = new Date(start); day <= now; day = new Date(day.getTime() + 86_400_000)) {
      const r = rng(`${t.id}|${dayOf(day)}`);
      const weekend = [0, 6].includes(day.getUTCDay());
      const at = new Date(Math.min(now.getTime(), day.getTime() + 10 * 3_600_000)).toISOString();
      for (const a of AI) {
        const n = Math.round(a.perDay * heavy * (weekend ? 0.2 : 1) * (0.5 + r()));
        for (let i = 0; i < n; i++) {
          const u = people[Math.floor(r() * people.length)];
          const usage = { input_tokens: Math.round(a.inT * (0.6 + r() * 0.8)), output_tokens: Math.round(a.outT * (0.6 + r() * 0.8)), server_tool_use: { web_search_requests: a.web ?? 0 } };
          out.push({ tenantId: t.id, userId: u.id, at, feature: a.feature, provider: 'anthropic', model: a.model, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
            cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: a.web ?? 0, units: 0, costUsd: claudeCost(a.model, usage) });
        }
      }
      const u = people[Math.floor(r() * people.length)];
      const units = (feature: string, provider: UsageEvent['provider'], n: number, cost: number, model: string | null = null) => {
        if (n > 0) out.push({ tenantId: t.id, userId: u.id, at, feature, provider, model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0, units: n, costUsd: cost });
      };
      const audio = Math.round(heavy * 2 * r()) * 45;
      units('assistant.audio', 'openai', audio, (audio / 60) * 0.006, 'whisper-1');
      const tpl = Math.round(3 * r() * (weekend ? 0 : 1));
      units('whatsapp.template', 'meta', tpl, tpl * 0.02, 'utility');
      const mails = Math.round(8 * r());
      units('email.immediate', 'email', mails, mails * 0.0004);
      const media = Math.round(heavy * 1.5 * r());
      units('social.download', 'media', media, 0);
    }
  });
  return out;
}

let cache: { day: string; rows: UsageEvent[] } | null = null;
/** Lo de la demo (real + ejemplo), agrupado como platform_usage. */
export function demoUsageRows(from: Date, to: Date, now = new Date()): UsageRow[] {
  if (cache?.day !== dayOf(now)) cache = { day: dayOf(now), rows: sampleEvents(now) };
  const users = new Map(demoDb().users.map((u) => [u.id, u.display_name || u.email.split('@')[0]]));
  const groups = new Map<string, UsageRow>();
  for (const e of [...cache.rows, ...demoUsage()]) {
    const t = Date.parse(e.at);
    if (t < from.getTime() || t >= to.getTime()) continue;
    const day = dayOf(new Date(t));
    const k = [e.tenantId, day, e.feature, e.provider, e.model, e.userId].join('|');
    const g = groups.get(k) ?? { tenantId: e.tenantId, day, feature: e.feature, provider: e.provider, model: e.model, userId: e.userId, userName: e.userId ? users.get(e.userId) ?? null : null,
      events: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0, units: 0, costUsd: 0 };
    g.events++; g.inputTokens += e.inputTokens; g.outputTokens += e.outputTokens; g.cacheReadTokens += e.cacheReadTokens; g.cacheWriteTokens += e.cacheWriteTokens;
    g.webSearches += e.webSearches; g.units += e.units; g.costUsd += e.costUsd;
    groups.set(k, g);
  }
  return [...groups.values()];
}
