/** Privacidad en Supabase, con service role (supabase/migrations/20261222000000_lead_privacy.sql). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { check, eventOf, leadOf, LEAD_COLS, msgOf, subOf, toRow } from './db-supabase';
import type { ConsentProof, PrivacyDb, PrivacyRequest, PurgeLog, PurgeKind, SuppressionRow } from './privacy';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const supRow = (r: Row): SuppressionRow => ({ channel: r.channel, value: r.value, reason: r.reason ?? null, at: r.at ?? null });
const logOf = (r: Row): PurgeLog => ({ tenantId: r.tenant_id, ranAt: r.ran_at, anonymized: r.anonymized, deleted: r.deleted, tests: r.tests, proofsDeleted: r.proofs_deleted, hashed: r.hashed });
const reqOf = (r: Row): PrivacyRequest => ({ id: r.id, tenantId: r.tenant_id, at: r.at, kind: r.kind, subjectHash: r.subject_hash, byUser: r.by_user, summary: r.summary ?? {} });
const proofRow = (p: ConsentProof) => ({
  tenant_id: p.tenantId, subject_hash: p.subjectHash, received_at: p.receivedAt, schema: p.schema, consent: p.consent, origin: p.origin, page_path: p.pagePath,
  reason: p.reason, blocked_at: p.blockedAt, delete_after: p.deleteAfter,
});

export function supabasePrivacyDb(sb: SupabaseClient): PrivacyDb {
  const children = async (id: string) => {
    for (const t of ['lead_message', 'lead_event', 'lead_submission']) check(await sb.from(t).delete().eq('lead_id', id));
  };
  return {
    async dueTenants(before, limit) {
      const rows = check(await sb.from('lead_settings').select('tenant_id').or(`last_purge_at.is.null,last_purge_at.lt."${before}"`).limit(limit)) as Row[];
      return rows.map((r) => r.tenant_id);
    },
    async candidates(tenantId, c, limit) {
      const rows = check(await sb.rpc('lead_purge_candidates', { p_tenant: tenantId, p_lead_before: c.lead, p_spam_before: c.spam, p_test_before: c.test, p_limit: limit })) as Row[];
      return rows.map((r) => ({ id: r.id, kind: r.kind as PurgeKind }));
    },
    async bundle(id) {
      const l = check(await sb.from('lead').select('*').eq('id', id).maybeSingle()) as Row | null;
      if (!l) return null;
      const [subs, evs, msgs] = await Promise.all([
        sb.from('lead_submission').select('*').eq('lead_id', id).order('received_at'),
        sb.from('lead_event').select('*').eq('lead_id', id).order('at'),
        sb.from('lead_message').select('*').eq('lead_id', id).order('created_at'),
      ]);
      return { lead: leadOf(l), submissions: (check(subs) as Row[]).map(subOf), events: (check(evs) as Row[]).map(eventOf), messages: (check(msgs) as Row[]).map(msgOf) };
    },
    async leadsByEmail(tenantId, email) {
      return (check(await sb.from('lead').select('*').eq('tenant_id', tenantId).eq('email', email).is('anonymized_at', null)) as Row[]).map(leadOf);
    },
    async deleteLead(id) { check(await sb.from('lead').delete().eq('id', id)); },
    async anonymizeLead(id, patch) {
      await children(id);
      check(await sb.from('lead').update(toRow(patch as Record<string, unknown>, LEAD_COLS)).eq('id', id));
    },
    async addProofs(p) { if (p.length) check(await sb.from('lead_consent_proof').insert(p.map(proofRow))); },
    async countProofs(tenantId, subject) {
      const r = await sb.from('lead_consent_proof').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('subject_hash', subject);
      if (r.error) throw new Error(`[supabase] ${r.error.message}`);
      return r.count ?? 0;
    },
    async deleteExpiredProofs(tenantId, nowIso) {
      return (check(await sb.from('lead_consent_proof').delete().eq('tenant_id', tenantId).lt('delete_after', nowIso).select('id')) as Row[]).length;
    },
    async plainSuppressions(tenantId, limit) {
      return (check(await sb.from('lead_suppression').select('*').eq('tenant_id', tenantId).not('value', 'like', 'h1:%').limit(limit)) as Row[]).map(supRow);
    },
    async replaceSuppression(tenantId, row, hashed) {
      check(await sb.from('lead_suppression').upsert({ tenant_id: tenantId, channel: row.channel, value: hashed, reason: row.reason, ...(row.at ? { at: row.at } : {}) }, { onConflict: 'tenant_id,channel,value', ignoreDuplicates: true }));
      check(await sb.from('lead_suppression').delete().eq('tenant_id', tenantId).eq('channel', row.channel).eq('value', row.value));
    },
    async suppressionOf(tenantId, values) {
      if (!values.length) return [];
      return (check(await sb.from('lead_suppression').select('*').eq('tenant_id', tenantId).in('value', values)) as Row[]).map(supRow);
    },
    async markPurged(log) {
      check(await sb.from('lead_purge_log').insert({ tenant_id: log.tenantId, ran_at: log.ranAt, anonymized: log.anonymized, deleted: log.deleted, tests: log.tests, proofs_deleted: log.proofsDeleted, hashed: log.hashed }));
      check(await sb.from('lead_settings').update({ last_purge_at: log.ranAt }).eq('tenant_id', log.tenantId));
    },
    async purges(tenantId, limit) {
      return (check(await sb.from('lead_purge_log').select('*').eq('tenant_id', tenantId).order('ran_at', { ascending: false }).limit(limit)) as Row[]).map(logOf);
    },
    async crmByEmail(tenantId, email) {
      const found = check(await sb.rpc('crm_find_by_email', { p_tenant: tenantId, p_emails: [email], p_domains: [] })) as Row[];
      const contactIds = [...new Set(found.filter((f) => f.kind === 'contact').map((f) => f.contact_id as string))];
      const accountIds = [...new Set(found.filter((f) => f.kind === 'account').map((f) => f.account_id as string))];
      const none = Promise.resolve({ data: [], error: null });
      const [contacts, links, acts, accounts, inA, inB] = await Promise.all([
        contactIds.length ? sb.from('crm_contact').select('*').in('id', contactIds) : none,
        contactIds.length ? sb.from('crm_contact_account').select('*').in('contact_id', contactIds) : none,
        contactIds.length ? sb.from('crm_activity').select('*').eq('tenant_id', tenantId).in('contact_id', contactIds) : none,
        accountIds.length ? sb.from('account').select('id, name, email').in('id', accountIds) : none,
        sb.from('inbound_email').select('*').eq('tenant_id', tenantId).eq('counterpart', email),
        sb.from('inbound_email').select('*').eq('tenant_id', tenantId).eq('from_addr', email),
      ]);
      const inbound = [...new Map([...(check(inA) as Row[]), ...(check(inB) as Row[])].map((r) => [r.id, r])).values()];
      const fromEmails = inbound.map((r) => r.activity_id).filter(Boolean) as string[];
      const known = new Set((check(acts) as Row[]).map((a) => a.id));
      const extra = fromEmails.filter((id) => !known.has(id));
      const more = extra.length ? (check(await sb.from('crm_activity').select('*').eq('tenant_id', tenantId).in('id', extra)) as Row[]) : [];
      return { contacts: check(contacts) as Row[], links: check(links) as Row[], activities: [...(check(acts) as Row[]), ...more], accounts: check(accounts) as Row[] as Array<{ id: string; name: string; email: string | null }>, inbound };
    },
    async eraseCrm(tenantId, ids) {
      const del = async (t: string, list: string[]) => (list.length ? (check(await sb.from(t).delete().eq('tenant_id', tenantId).in('id', list).select('id')) as Row[]).length : 0);
      const inbound = await del('inbound_email', ids.inbound);
      const activities = await del('crm_activity', ids.activities);
      const contacts = await del('crm_contact', ids.contacts);
      return { contacts, activities, inbound };
    },
    async logRequest(r) {
      check(await sb.from('privacy_request').insert({ tenant_id: r.tenantId, kind: r.kind, subject_hash: r.subjectHash, by_user: r.byUser, summary: r.summary, ...(r.at ? { at: r.at } : {}) }));
    },
    async requests(tenantId, limit) {
      return (check(await sb.from('privacy_request').select('*').eq('tenant_id', tenantId).order('at', { ascending: false }).limit(limit)) as Row[]).map(reqOf);
    },
  };
}
