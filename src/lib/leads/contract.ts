/**
 * Contrato web → CRM (docs/LEADS.md §Contrato). Acepta enjoy.lead.v2 y, mientras dure la transición, enjoy.lead.v1.
 * Todo se reduce a un LeadInput: lo que el resto del CRM entiende, sin depender de la versión.
 */
import { z } from 'zod';

export const LEAD_TYPES = ['general', 'venue', 'dj', 'festival', 'wedding', 'wedding_partner', 'custom_dev', 'waitlist'] as const;
export type LeadType = (typeof LEAD_TYPES)[number];
export const HOW_HEARD = ['google', 'instagram', 'tiktok', 'linkedin', 'recommendation', 'event', 'press', 'other'] as const;
const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'fbp', 'fbc', 'ttclid', 'msclkid', 'referrer', 'landing_page', 'at'] as const;
export type AttributionKey = (typeof ATTR_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey, string>>;
/**
 * Identificadores de clic de las plataformas de anuncios (y las cookies de Meta). Sin consentimiento de cookies de
 * publicidad (context.cookie_consent.ads) no se guardan aunque lleguen: ni en la atribución ni dentro de las URLs.
 */
export const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'msclkid', 'fbp', 'fbc'] as const;
const CLICK_SET = new Set<string>(CLICK_IDS);

/** Quita los identificadores de clic de la query de una URL (absoluta o una ruta «/es/?gclid=…»). */
export function stripClickIds(u: string): string {
  const q = u.indexOf('?');
  if (q < 0) return u;
  const hash = u.indexOf('#', q);
  const query = u.slice(q + 1, hash < 0 ? undefined : hash);
  const kept = query.split('&').filter((kv) => kv && !CLICK_SET.has(decodeURIComponentSafe(kv.split('=')[0]).toLowerCase()));
  return u.slice(0, q) + (kept.length ? `?${kept.join('&')}` : '') + (hash < 0 ? '' : u.slice(hash));
}
const decodeURIComponentSafe = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
function withoutClickIds(a: Attribution | null): Attribution | null {
  if (!a) return null;
  const out: Attribution = {};
  for (const [k, v] of Object.entries(a) as [AttributionKey, string][]) {
    if (CLICK_SET.has(k)) continue;
    out[k] = k === 'landing_page' || k === 'referrer' ? stripClickIds(v) : v;
  }
  return Object.keys(out).length ? out : null;
}

/** Los campos que se esperan por tipo; los obligatorios, con `required`. Lo demás que llegue se guarda igual (string). */
export const FIELDS: Record<LeadType, { key: string; required?: boolean; values?: readonly string[] }[]> = {
  general: [{ key: 'event_type', required: true, values: ['venue', 'festival', 'wedding', 'dj', 'other'] }],
  venue: [{ key: 'venue_name' }, { key: 'city' }],
  dj: [{ key: 'city' }],
  festival: [{ key: 'event_name' }, { key: 'attendees', values: ['<500', '500-2000', '2000-10000', '>10000'] }],
  wedding: [{ key: 'wedding_date' }, { key: 'guests' }],
  wedding_partner: [{ key: 'company', required: true }, { key: 'website' }],
  custom_dev: [{ key: 'company' }, { key: 'budget', values: ['<5k', '5k-15k', '15k-50k', '>50k', 'unknown'] }],
  waitlist: [],
};

const str = (max: number) => z.string().trim().max(max);
const attribution = z.record(z.string(), z.unknown()).nullable().optional()
  .transform((o): Attribution | null => {
    if (!o) return null;
    const out: Attribution = {};
    for (const k of ATTR_KEYS) { const v = o[k]; if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 500); }
    return Object.keys(out).length ? out : null;
  });
const fields = z.record(z.string().regex(/^[a-z_]{1,40}$/), z.union([z.string(), z.number()]).transform((v) => String(v).trim().slice(0, 300)))
  .default({}).refine((o) => Object.keys(o).length <= 30, 'Demasiados campos');

const contact = z.object({
  name: str(160).min(1),
  email: str(254).toLowerCase().email(),
  phone: str(40).optional().nullable(),
  phone_country: z.string().regex(/^[A-Za-z]{2}$/).optional().nullable(),
});

const base = {
  idempotency_key: z.string().trim().min(1).max(100),
  brand: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,39}$/),
  type: z.enum(LEAD_TYPES),
  contact,
  fields,
  message: str(5000).optional().nullable(),
  test: z.boolean().optional(),
  antispam: z.object({ turnstile_token: z.string().max(4000).optional() }).partial().optional(),
};
const locale = z.string().trim().toLowerCase().regex(/^[a-z]{2}(-[a-z]{2})?$/).transform((l) => l.slice(0, 2)).optional();

const v2 = z.object({
  schema: z.literal('enjoy.lead.v2'),
  ...base,
  consent: z.object({
    marketing: z.boolean().default(false),
    // whatsapp_notice_shown es el nombre nuevo; whatsapp_contact se acepta igual.
    whatsapp_notice_shown: z.boolean().optional(),
    whatsapp_contact: z.boolean().optional(),
    whatsapp_text_version: str(40).optional(),
    legal_text_version: str(40).optional(),
    policy_url: str(500).optional(),
    submitted_at: str(40).optional(),
  }).passthrough(),
  context: z.object({
    locale,
    form_version: str(40).optional(),
    page_url: str(2000).optional(), page_path: str(500).optional(), page_title: str(300).optional(),
    cta: z.union([z.object({ id: str(100).optional(), label: str(200).optional(), location: str(100).optional() }), str(200)]).optional().nullable(),
    cookie_consent: z.object({ analytics: z.boolean().optional(), ads: z.boolean().optional() }).partial().optional().nullable(),
    attribution: z.object({ current: attribution, first: attribution, last: attribution }).partial().optional().nullable(),
    time_to_submit_ms: z.number().int().nonnegative().optional().nullable(),
    submitted_at: str(40).optional(), user_agent: str(500).optional(), browser_language: str(40).optional(), viewport: str(20).optional(),
  }).passthrough().default({}),
});

const v1 = z.object({
  schema: z.literal('enjoy.lead.v1'),
  ...base,
  consent: z.object({ privacy: z.literal(true), policy_url: str(500).optional(), accepted_at: str(40).optional() }).passthrough(),
  context: z.object({
    locale,
    page_url: str(2000).optional(), page_path: str(500).optional(), page_title: str(300).optional(),
    cta: str(200).optional().nullable(),
    attribution: z.object({ first: attribution, last: attribution }).partial().optional().nullable(),
    time_to_submit_ms: z.number().int().nonnegative().optional().nullable(),
    submitted_at: str(40).optional(), user_agent: str(500).optional(), browser_language: str(40).optional(), viewport: str(20).optional(),
  }).passthrough().default({}),
});

export interface LeadInput {
  schema: 'enjoy.lead.v1' | 'enjoy.lead.v2';
  idempotencyKey: string;
  brand: string;
  type: LeadType;
  name: string;
  email: string;
  phone: string | null;
  phoneCountry: string | null;
  fields: Record<string, string>;
  message: string | null;
  test: boolean;
  turnstileToken: string | null;
  consent: { marketing: boolean; whatsappNotice: boolean; ads: boolean; raw: Record<string, unknown> };
  locale: string;
  cta: { id: string | null; label: string | null; location: string | null };
  page: { url: string | null; path: string | null; title: string | null };
  attribution: { current: Attribution | null; first: Attribution | null; last: Attribution | null };
  timeToSubmitMs: number | null;
  /** El contexto tal cual (sin la atribución, que va aparte). */
  context: Record<string, unknown>;
}

export type ParseResult = { ok: true; lead: LeadInput } | { ok: false; status: 400; errors: Record<string, string> };

function errorsOf(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path.join('.') || 'body';
    if (!out[k]) out[k] = i.code === 'invalid_literal' && k === 'schema' ? 'unknown_schema' : i.code === 'invalid_string' && i.validation === 'email' ? 'invalid' : i.message === 'Required' ? 'required' : 'invalid';
  }
  return out;
}

export function parseLead(body: unknown): ParseResult {
  const schema = (body && typeof body === 'object' ? (body as { schema?: unknown }).schema : undefined);
  if (schema !== 'enjoy.lead.v2' && schema !== 'enjoy.lead.v1') return { ok: false, status: 400, errors: { schema: 'unknown_schema' } };
  const r = schema === 'enjoy.lead.v2' ? v2.safeParse(body) : v1.safeParse(body);
  if (!r.success) return { ok: false, status: 400, errors: errorsOf(r.error) };
  const d = r.data;
  // Campos obligatorios y valores cerrados por tipo.
  const errors: Record<string, string> = {};
  for (const f of FIELDS[d.type]) {
    const v = d.fields[f.key];
    if (f.required && !v) errors[`fields.${f.key}`] = 'required';
    else if (v && f.values && !f.values.includes(v)) errors[`fields.${f.key}`] = 'invalid';
  }
  if (d.fields.wedding_date && !/^\d{4}-\d{2}-\d{2}$/.test(d.fields.wedding_date)) errors['fields.wedding_date'] = 'invalid';
  if (d.fields.how_heard && !(HOW_HEARD as readonly string[]).includes(d.fields.how_heard)) errors['fields.how_heard'] = 'invalid';
  if (Object.keys(errors).length) return { ok: false, status: 400, errors };

  const ctx = d.context as Record<string, unknown> & typeof d.context;
  const cta = typeof ctx.cta === 'string' ? { id: null, label: ctx.cta, location: null }
    : { id: ctx.cta?.id ?? null, label: ctx.cta?.label ?? null, location: ctx.cta?.location ?? null };
  const consentRaw = d.consent as Record<string, unknown>;
  const v2c = d.schema === 'enjoy.lead.v2' ? (d.consent as z.infer<typeof v2>['consent']) : null;
  const cookie = d.schema === 'enjoy.lead.v2' ? (ctx as z.infer<typeof v2>['context']).cookie_consent : null;
  const ads = cookie?.ads === true;
  const rawAtt = (ctx.attribution ?? {}) as { current?: Attribution | null; first?: Attribution | null; last?: Attribution | null };
  // Sin consentimiento de publicidad: fuera gclid, fbclid… (también de page_url, landing_page y el resto del contexto).
  const att = ads ? rawAtt : { current: withoutClickIds(rawAtt.current ?? null), first: withoutClickIds(rawAtt.first ?? null), last: withoutClickIds(rawAtt.last ?? null) };
  const { attribution: _a, ...rawRest } = ctx;
  const rest: Record<string, unknown> = ads ? rawRest : Object.fromEntries(Object.entries(rawRest)
    .filter(([k]) => !CLICK_SET.has(k.toLowerCase()))
    .map(([k, v]) => [k, typeof v === 'string' && /^(page_url|landing_page|referrer|url)$/.test(k) ? stripClickIds(v) : v]));
  const pageUrl = ctx.page_url ? (ads ? ctx.page_url : stripClickIds(ctx.page_url)) : null;
  return {
    ok: true,
    lead: {
      schema: d.schema,
      idempotencyKey: d.idempotency_key,
      brand: d.brand,
      type: d.type,
      name: d.contact.name,
      email: d.contact.email,
      phone: d.contact.phone?.trim() || null,
      phoneCountry: d.contact.phone_country?.toUpperCase() ?? null,
      fields: d.fields,
      message: d.message?.trim() || null,
      test: d.test === true,
      turnstileToken: d.antispam?.turnstile_token ?? null,
      consent: {
        marketing: v2c?.marketing === true,
        // v1 no avisaba de WhatsApp: no se escribe por WhatsApp a quien no lo vio.
        whatsappNotice: v2c ? (v2c.whatsapp_notice_shown ?? v2c.whatsapp_contact) === true : false,
        ads,
        raw: consentRaw,
      },
      locale: ctx.locale ?? 'es',
      cta,
      page: { url: pageUrl, path: ctx.page_path ? (ads ? ctx.page_path : stripClickIds(ctx.page_path)) : null, title: ctx.page_title ?? null },
      // Sin cookies aceptadas, la web solo manda «current»: hace de primer y último contacto.
      attribution: { current: att.current ?? null, first: att.first ?? null, last: att.last ?? null },
      timeToSubmitMs: ctx.time_to_submit_ms ?? null,
      context: rest,
    },
  };
}
