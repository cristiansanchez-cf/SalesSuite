/** Doble en memoria de IngestDb para los tests (ingest, Stripe). */
import type { IngestDb } from './db';
import type { RevenueEvent } from './types';

export function memDb(): IngestDb & { rows: RevenueEvent[]; subs: Map<string, string> } {
  const rows: RevenueEvent[] = [];
  const subs = new Map<string, string>();
  return {
    rows, subs,
    async tenantForKey() { return null; }, async touchKey() {}, async connector() { return null; },
    async findEvent(t, s, x) { return rows.find((r) => r.tenantId === t && r.source === s && r.externalId === x) ?? null; },
    async insertEvent(t, e) { const id = `id${rows.length + 1}`; rows.push({ ...e, id, tenantId: t, createdAt: '' }); return id; },
    async accountByRef(_t, ref) { return ref === 'oquea:c1' ? 'acc-1' : null; },
    async userByEmail(_t, email) { return email === 'ana@x.es' ? 'ana' : null; },
    async dossierInTenant(_t, id) { return id.startsWith('00000000-0000-4000-8000-0000000d'); },
    async webhookSecret(t) { return t === 't' ? 'whsec_test_secret_123' : null; },
    async subscriptionDossier(_t, sub) { return subs.get(sub) ?? null; },
    async linkSubscription(_t, sub, d) { if (!subs.has(sub)) subs.set(sub, d); },
    async attachDossier(t, s, x, d) { const r = rows.find((e) => e.tenantId === t && e.source === s && e.externalId === x); if (r && !r.dossierId) r.dossierId = d; },
  };
}
