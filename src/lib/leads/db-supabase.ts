import type { SupabaseClient } from '@supabase/supabase-js';
import { CONSOLE_TEST_PREFIX, DuplicateKey, type LeadsDb } from './db';
import { suppressionKey } from './privacy';
import { DEFAULT_RETENTION, type Lead, type LeadEvent, type LeadMessage, type LeadSettings, type Submission } from './types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (res.error.code === '23505') throw new DuplicateKey(res.error.message);
    if (res.error.code === '42501') throw new Error(`permission denied: ${res.error.message}`);
    throw new Error(`[supabase] ${res.error.message}`);
  }
  return res.data;
}

const settingsOf = (r: Row): LeadSettings => ({
  tenantId: r.tenant_id, enabled: r.enabled, brand: r.brand, allowedOrigins: r.allowed_origins ?? [], fromEmail: r.from_email, fromName: r.from_name,
  replyTo: r.reply_to, signerName: r.signer_name, notifyEmails: r.notify_emails ?? [], bookingUrl: r.booking_url, videoUrl: r.video_url,
  whatsappPhoneId: r.whatsapp_phone_id, whatsappEnabled: r.whatsapp_enabled, whatsappTemplates: r.whatsapp_templates ?? {}, timezone: r.timezone,
  sendFromHour: r.send_from_hour, sendToHour: r.send_to_hour, holidays: r.holidays ?? [], resendKeyHint: r.resend_key_hint ?? null,
  templates: r.templates ?? {}, aiContext: r.ai_context ?? null, emailSignature: r.email_signature ?? {}, media: r.media ?? {},
  whatsappWa2: r.whatsapp_wa2_enabled ?? true, lastPurgeAt: r.last_purge_at ?? null, emailStyle: r.email_style ?? undefined,
  retention: {
    leadMonths: r.retention_lead_months ?? DEFAULT_RETENTION.leadMonths, spamMonths: r.retention_spam_months ?? DEFAULT_RETENTION.spamMonths,
    testDays: r.retention_test_days ?? DEFAULT_RETENTION.testDays, proofYears: r.retention_proof_years ?? DEFAULT_RETENTION.proofYears,
  },
});
export const leadOf = (r: Row): Lead => ({
  id: r.id, tenantId: r.tenant_id, createdAt: r.created_at, isTest: r.is_test, email: r.email, emailKind: r.email_kind, domain: r.domain, name: r.name,
  phoneRaw: r.phone_raw, phoneE164: r.phone_e164, type: r.type, locale: r.locale, stage: r.stage, stageAt: r.stage_at, discardReason: r.discard_reason,
  quarantined: r.quarantined, quarantineReasons: r.quarantine_reasons ?? [], validatedAt: r.validated_at, validatedBy: r.validated_by, score: r.score,
  scoreDetail: r.score_detail, facts: r.facts ?? {}, attributionFirst: r.attribution_first, attributionLast: r.attribution_last,
  consentMarketing: r.consent_marketing, consentAds: r.consent_ads, whatsappOk: r.whatsapp_ok, firstResponseAt: r.first_response_at,
  firstResponseMins: r.first_response_mins, lastInboundAt: r.last_inbound_at, sequenceStoppedAt: r.sequence_stopped_at,
  sequenceStopReason: r.sequence_stop_reason, submissions: r.submissions, lastSubmissionAt: r.last_submission_at, accountId: r.account_id, contactId: r.contact_id,
  anonymizedAt: r.anonymized_at ?? null,
});
export const subOf = (r: Row): Submission => ({
  id: r.id, tenantId: r.tenant_id, leadId: r.lead_id, receivedAt: r.received_at, idempotencyKey: r.idempotency_key, schema: r.schema, isTest: r.is_test,
  type: r.type, fields: r.fields ?? {}, message: r.message, consent: r.consent ?? {}, context: r.context ?? {}, origin: r.origin, ipHash: r.ip_hash,
  spamReasons: r.spam_reasons ?? [], response: r.response ?? {},
});
export const eventOf = (r: Row): LeadEvent => ({ id: r.id, tenantId: r.tenant_id, leadId: r.lead_id, at: r.at, kind: r.kind, fromStage: r.from_stage, toStage: r.to_stage, byUser: r.by_user, data: r.data ?? {} });
export const msgOf = (r: Row): LeadMessage => ({
  id: r.id, tenantId: r.tenant_id, leadId: r.lead_id, createdAt: r.created_at, channel: r.channel, step: r.step, toAddr: r.to_addr, sendAt: r.send_at,
  status: r.status, attempts: r.attempts, sentAt: r.sent_at, providerId: r.provider_id, error: r.error, payload: r.payload ?? {},
});

export const LEAD_COLS: Record<string, string> = {
  tenantId: 'tenant_id', createdAt: 'created_at', isTest: 'is_test', email: 'email', emailKind: 'email_kind', domain: 'domain', name: 'name', phoneRaw: 'phone_raw',
  phoneE164: 'phone_e164', type: 'type', locale: 'locale', stage: 'stage', stageAt: 'stage_at', discardReason: 'discard_reason', quarantined: 'quarantined',
  quarantineReasons: 'quarantine_reasons', validatedAt: 'validated_at', validatedBy: 'validated_by', score: 'score', scoreDetail: 'score_detail', facts: 'facts',
  attributionFirst: 'attribution_first', attributionLast: 'attribution_last', consentMarketing: 'consent_marketing', consentAds: 'consent_ads',
  whatsappOk: 'whatsapp_ok', firstResponseAt: 'first_response_at', firstResponseMins: 'first_response_mins', lastInboundAt: 'last_inbound_at',
  sequenceStoppedAt: 'sequence_stopped_at', sequenceStopReason: 'sequence_stop_reason', submissions: 'submissions', lastSubmissionAt: 'last_submission_at',
  accountId: 'account_id', contactId: 'contact_id', anonymizedAt: 'anonymized_at',
};
export const toRow = (o: Record<string, unknown>, cols: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && cols[k]).map(([k, v]) => [cols[k], v]));

export function supabaseLeadsDb(sb: SupabaseClient): LeadsDb {
  return {
    async settings(tenantId) {
      const r = check(await sb.from('lead_settings').select('*').eq('tenant_id', tenantId).maybeSingle()) as Row | null;
      return r ? settingsOf(r) : null;
    },
    async settingsByWhatsappPhone(phoneId) {
      const r = check(await sb.from('lead_settings').select('*').eq('whatsapp_phone_id', phoneId).limit(1).maybeSingle()) as Row | null;
      return r ? settingsOf(r) : null;
    },
    async saveSettings(s) {
      check(await sb.from('lead_settings').upsert({
        tenant_id: s.tenantId, enabled: s.enabled, brand: s.brand, allowed_origins: s.allowedOrigins, from_email: s.fromEmail, from_name: s.fromName,
        reply_to: s.replyTo, signer_name: s.signerName, notify_emails: s.notifyEmails, booking_url: s.bookingUrl, video_url: s.videoUrl,
        whatsapp_phone_id: s.whatsappPhoneId, whatsapp_enabled: s.whatsappEnabled, whatsapp_templates: s.whatsappTemplates, timezone: s.timezone,
        send_from_hour: s.sendFromHour, send_to_hour: s.sendToHour, holidays: s.holidays,
        ...(s.templates !== undefined ? { templates: s.templates } : {}), ...(s.aiContext !== undefined ? { ai_context: s.aiContext } : {}), ...(s.emailSignature !== undefined ? { email_signature: s.emailSignature } : {}), ...(s.media !== undefined ? { media: s.media } : {}),
        ...(s.whatsappWa2 !== undefined ? { whatsapp_wa2_enabled: s.whatsappWa2 } : {}), ...(s.emailStyle !== undefined ? { email_style: s.emailStyle } : {}),
        ...(s.retention ? { retention_lead_months: s.retention.leadMonths, retention_spam_months: s.retention.spamMonths, retention_test_days: s.retention.testDays, retention_proof_years: s.retention.proofYears } : {}),
      }, { onConflict: 'tenant_id' }));
    },
    async resendKey(tenantId) {
      const r = check(await sb.from('lead_secret').select('resend_key_enc').eq('tenant_id', tenantId).maybeSingle()) as Row | null;
      return r?.resend_key_enc ?? null;
    },
    async setResendKey(tenantId, sealed, hint, by) {
      check(await sb.from('lead_secret').upsert({ tenant_id: tenantId, resend_key_enc: sealed, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' }));
      check(await sb.from('lead_settings').update({ resend_key_hint: hint }).eq('tenant_id', tenantId));
    },
    async submissionByKey(tenantId, key) {
      const r = check(await sb.from('lead_submission').select('*').eq('tenant_id', tenantId).eq('idempotency_key', key).maybeSingle()) as Row | null;
      return r ? subOf(r) : null;
    },
    async leadByEmail(tenantId, email, isTest) {
      const r = check(await sb.from('lead').select('*').eq('tenant_id', tenantId).eq('email', email).eq('is_test', isTest).maybeSingle()) as Row | null;
      return r ? leadOf(r) : null;
    },
    async leadsByPhone(tenantId, e164) {
      return (check(await sb.from('lead').select('*').eq('tenant_id', tenantId).eq('phone_e164', e164).order('last_submission_at', { ascending: false }).limit(5)) as Row[]).map(leadOf);
    },
    async getLead(id) {
      const r = check(await sb.from('lead').select('*').eq('id', id).maybeSingle()) as Row | null;
      return r ? leadOf(r) : null;
    },
    async insertLead(l) {
      return leadOf(check(await sb.from('lead').insert(toRow(l as unknown as Record<string, unknown>, LEAD_COLS)).select('*').single()) as Row);
    },
    async updateLead(id, patch) {
      const rows = check(await sb.from('lead').update(toRow(patch as Record<string, unknown>, LEAD_COLS)).eq('id', id).select('id')) as Row[];
      return rows.length > 0;
    },
    async insertSubmission(s) {
      const r = check(await sb.from('lead_submission').insert({
        tenant_id: s.tenantId, lead_id: s.leadId, received_at: s.receivedAt, idempotency_key: s.idempotencyKey, schema: s.schema, is_test: s.isTest, type: s.type,
        fields: s.fields, message: s.message, consent: s.consent, context: s.context, origin: s.origin, ip_hash: s.ipHash, spam_reasons: s.spamReasons, response: s.response,
      }).select('id').single()) as Row;
      return r.id;
    },
    async setSubmissionResponse(id, response) { check(await sb.from('lead_submission').update({ response }).eq('id', id)); },
    async countSubmissions(tenantId, by, sinceIso) {
      let q = sb.from('lead_submission').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('received_at', sinceIso);
      if (by.ipHash) q = q.eq('ip_hash', by.ipHash);
      if (by.leadId) q = q.eq('lead_id', by.leadId);
      const r = await q;
      if (r.error) throw new Error(`[supabase] ${r.error.message}`);
      return r.count ?? 0;
    },
    async submissions(leadId) {
      return (check(await sb.from('lead_submission').select('*').eq('lead_id', leadId).order('received_at', { ascending: false }).limit(50)) as Row[]).map(subOf);
    },
    async addEvent(e) {
      check(await sb.from('lead_event').insert({ tenant_id: e.tenantId, lead_id: e.leadId, at: e.at, kind: e.kind, from_stage: e.fromStage ?? null, to_stage: e.toStage ?? null, by_user: e.byUser ?? null, data: e.data }));
    },
    async events(leadId) {
      return (check(await sb.from('lead_event').select('*').eq('lead_id', leadId).order('at', { ascending: true }).limit(300)) as Row[]).map(eventOf);
    },
    async enqueue(ms) {
      if (!ms.length) return;
      check(await sb.from('lead_message').insert(ms.map((m) => ({ tenant_id: m.tenantId, lead_id: m.leadId, channel: m.channel, step: m.step, to_addr: m.toAddr, send_at: m.sendAt, payload: m.payload ?? {} }))));
    },
    async messages(leadId) {
      return (check(await sb.from('lead_message').select('*').eq('lead_id', leadId).order('created_at', { ascending: true }).limit(100)) as Row[]).map(msgOf);
    },
    async dueMessages(nowIso, limit, leadId) {
      let q = sb.from('lead_message').select('*').eq('status', 'pending').lte('send_at', nowIso).order('send_at', { ascending: true }).limit(limit);
      if (leadId) q = q.eq('lead_id', leadId);
      return (check(await q) as Row[]).map(msgOf);
    },
    async claimMessage(id) {
      const rows = check(await sb.from('lead_message').update({ status: 'sending' }).eq('id', id).eq('status', 'pending').select('id')) as Row[];
      return rows.length > 0;
    },
    async updateMessage(id, p) {
      check(await sb.from('lead_message').update(toRow(p as Record<string, unknown>, { status: 'status', attempts: 'attempts', sentAt: 'sent_at', providerId: 'provider_id', error: 'error', sendAt: 'send_at', payload: 'payload' })).eq('id', id));
    },
    async cancelPending(leadId, steps) {
      let q = sb.from('lead_message').update({ status: 'cancelled' }).eq('lead_id', leadId).eq('status', 'pending');
      if (steps) q = q.in('step', steps);
      return (check(await q.select('id')) as Row[]).length;
    },
    async suppressed(tenantId, v) {
      // Se guarda el hash; las filas antiguas en claro valen hasta que el borrado diario las convierte.
      const keys = (x: string | null | undefined) => (x ? [x, suppressionKey(x)].filter((k): k is string => !!k) : []);
      const vals = [...keys(v.email), ...keys(v.phone)];
      if (!vals.length) return { email: false, whatsapp: false };
      const rows = check(await sb.from('lead_suppression').select('channel, value').eq('tenant_id', tenantId).in('value', vals)) as Row[];
      const hit = (val: string | null | undefined, ch: string) => !!val && rows.some((r) => keys(val).includes(r.value) && (r.channel === ch || r.channel === 'all'));
      return { email: hit(v.email, 'email'), whatsapp: hit(v.phone, 'whatsapp') || hit(v.email, 'all') };
    },
    async suppress(tenantId, channel, value, reason) {
      check(await sb.from('lead_suppression').upsert({ tenant_id: tenantId, channel, value: suppressionKey(value) ?? value, reason }, { onConflict: 'tenant_id,channel,value', ignoreDuplicates: true }));
    },
    async list(tenantId, view, opts = {}) {
      let q = sb.from('lead').select('*').eq('tenant_id', tenantId).order('last_submission_at', { ascending: false }).limit(opts.limit ?? 200);
      if (!opts.anonymized) q = q.is('anonymized_at', null);
      if (view === 'test') q = q.eq('is_test', true);
      else {
        q = q.eq('is_test', false);
        if (view === 'inbox') q = q.is('validated_at', null).eq('quarantined', false).neq('stage', 'spam');
        if (view === 'quarantine') q = q.eq('quarantined', true).neq('stage', 'spam');
        if (view === 'active') q = q.not('validated_at', 'is', null).in('stage', ['new', 'contacted', 'replied', 'booked', 'meeting', 'opportunity', 'nurture']);
        if (view === 'closed') q = q.in('stage', ['won', 'lost', 'discarded', 'spam']);
      }
      if (opts.q?.trim()) { const s = opts.q.trim().replace(/[%,()]/g, ' '); q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%`); }
      return (check(await q) as Row[]).map(leadOf);
    },
    async lastSubmission(tenantId, opts) {
      let q = sb.from('lead_submission').select('received_at, is_test').eq('tenant_id', tenantId);
      if (opts?.external) q = q.not('idempotency_key', 'like', `${CONSOLE_TEST_PREFIX}%`);
      const r = check(await q.order('received_at', { ascending: false }).limit(1).maybeSingle()) as Row | null;
      return r ? { at: r.received_at, test: r.is_test } : null;
    },
    async usedKinds(tenantId) {
      // Los últimos 500 bastan para saber qué tipos usa (lo personalizado se enseña igual, aunque no salga aquí).
      const rows = check(await sb.from('lead_submission').select('type, event_type:fields->>event_type, intent:fields->>intent').eq('tenant_id', tenantId)
        .order('received_at', { ascending: false }).limit(500)) as { type: string; event_type: string | null; intent: string | null }[];
      return [...new Set(rows.flatMap((r) => [r.type, r.event_type, r.intent]).filter((x): x is string => !!x))];
    },
    async counts(tenantId) {
      const c = async (quar: boolean) => {
        let q = sb.from('lead').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_test', false).eq('quarantined', quar).neq('stage', 'spam').is('anonymized_at', null);
        if (!quar) q = q.is('validated_at', null);
        const r = await q;
        return r.count ?? 0;
      };
      const [inbox, quarantine] = await Promise.all([c(false), c(true)]);
      return { inbox, quarantine };
    },
  };
}
