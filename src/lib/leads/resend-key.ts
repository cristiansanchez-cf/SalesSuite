/**
 * Guardar o quitar la clave de Resend de una empresa (docs/LEADS.md §Resend). Solo un admin del espacio. Se comprueba
 * contra Resend antes de guardarla y se guarda cifrada con service role: la sesión del usuario nunca la lee.
 */
import type { AdminContext } from '../admin/auth';
import { can } from '../admin/permissions';
import { AdminError } from '../admin/service';
import { hintOf, open, seal } from './secret-box';
import { leadsRuntime } from './server';

export const RESEND_KEY_ERRORS = { invalid: 'La clave de Resend no es válida', notConfigured: 'Falta LEADS_SECRET o CRON_SECRET en el servidor' } as const;

export interface ResendDomain { id?: string; name: string; status: string }
/** Un registro DNS que Resend pide poner (SPF, DKIM…), con su estado. */
export interface DnsRecord { record: string; type: string; name: string; value: string; priority?: number; status: string }
export interface DomainDetail { id: string; name: string; status: string; records: DnsRecord[] }

/** Los dominios de esa cuenta y su estado (si la clave tiene permiso completo; con una de solo envío, null). */
export async function resendDomains(key: string, fetchImpl: typeof fetch = fetch): Promise<ResendDomain[] | null | 'invalid'> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetchImpl('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` }, signal: ctl.signal });
    if (r.status === 401 || r.status === 400) return 'invalid';
    if (!r.ok) return null; // 403: clave restringida a enviar → vale, pero no deja ver dominios
    const body = (await r.json()) as { data?: { name: string; status: string }[] };
    return (body.data ?? []).map((d) => ({ id: (d as { id?: string }).id, name: d.name, status: d.status }));
  } catch { return null; } finally { clearTimeout(t); }
}

/** El detalle de un dominio: los registros DNS que hay que poner y cómo va cada uno (GET /domains/{id}). */
export async function resendDomainDetail(key: string, id: string, fetchImpl: typeof fetch = fetch): Promise<DomainDetail | null> {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetchImpl(`https://api.resend.com/domains/${id}`, { headers: { Authorization: `Bearer ${key}` }, signal: ctl.signal });
    if (!r.ok) return null;
    const d = (await r.json()) as { id: string; name: string; status: string; records?: Partial<DnsRecord>[] };
    // Solo lo que hace falta para enviar (SPF, DKIM); recibir y el seguimiento de clics no.
    const records = (d.records ?? []).filter((x) => x.record === 'SPF' || x.record === 'DKIM').map((x) => ({
      record: String(x.record), type: String(x.type ?? ''), name: String(x.name ?? ''), value: String(x.value ?? ''),
      ...(typeof x.priority === 'number' ? { priority: x.priority } : {}), status: String(x.status ?? 'not_started'),
    }));
    return { id: d.id, name: d.name, status: d.status, records };
  } catch { return null; } finally { clearTimeout(t); }
}

/** Pide a Resend que compruebe el DNS ahora (POST /domains/{id}/verify). Tarda unos minutos en cambiar el estado. */
export async function resendVerifyDomain(key: string, id: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) return false;
  try {
    const r = await fetchImpl(`https://api.resend.com/domains/${id}/verify`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch { return false; }
}

export async function setResendKey(admin: AdminContext, key: string | null): Promise<ResendDomain[] | null> {
  if (!can(admin.session.role).manageTenant) throw new AdminError(403, 'Sin permiso para esta operación');
  const rt = await leadsRuntime();
  if ('error' in rt) throw new AdminError(503, RESEND_KEY_ERRORS.notConfigured);
  const t = admin.session.tenantId;
  if (!key) { await rt.db.setResendKey(t, null, null, admin.session.userId); return null; }
  const k = key.trim();
  if (!/^re_[A-Za-z0-9_]{8,200}$/.test(k)) throw new AdminError(422, RESEND_KEY_ERRORS.invalid);
  const domains = rt.demo ? [] : await resendDomains(k);
  if (domains === 'invalid') throw new AdminError(422, RESEND_KEY_ERRORS.invalid);
  await rt.db.setResendKey(t, seal(k, rt.secret), hintOf(k), admin.session.userId);
  return domains;
}

/** Para la página de ajustes: los dominios de su cuenta (o null si no hay clave propia o no se pueden ver). */
export async function ownDomains(admin: AdminContext): Promise<ResendDomain[] | null> {
  if (!can(admin.session.role).manageTenant) return null;
  const rt = await leadsRuntime();
  if ('error' in rt || rt.demo) return null;
  const key = open(await rt.db.resendKey(admin.session.tenantId).catch(() => null), rt.secret);
  if (!key) return null;
  const d = await resendDomains(key);
  return d === 'invalid' ? null : d;
}

/** Ejemplo para la demo: un dominio a medio verificar con sus registros. */
const DEMO_DOMAIN: DomainDetail = {
  id: 'demo-domain', name: 'mail.ejemplo.com', status: 'pending',
  records: [
    { record: 'DKIM', type: 'TXT', name: 'resend._domainkey.mail', value: 'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC…', status: 'verified' },
    { record: 'SPF', type: 'MX', name: 'send.mail', value: 'feedback-smtp.eu-west-1.amazonses.com', priority: 10, status: 'pending' },
    { record: 'SPF', type: 'TXT', name: 'send.mail', value: 'v=spf1 include:amazonses.com ~all', status: 'pending' },
  ],
};

/** Los dominios de su propia cuenta con sus registros DNS (como mucho 3), para el paso guiado del email. */
export async function ownDomainDetails(admin: AdminContext): Promise<DomainDetail[] | null> {
  if (!can(admin.session.role).manageTenant) return null;
  const rt = await leadsRuntime();
  if ('error' in rt) return null;
  if (rt.demo) return (await rt.db.settings(admin.session.tenantId))?.resendKeyHint ? [structuredClone(DEMO_DOMAIN)] : null;
  const key = open(await rt.db.resendKey(admin.session.tenantId).catch(() => null), rt.secret);
  if (!key) return null;
  const list = await resendDomains(key);
  if (!list || list === 'invalid') return null;
  const out = await Promise.all(list.slice(0, 3).map(async (d) => (d.id ? await resendDomainDetail(key, d.id) : null) ?? { id: d.id ?? '', name: d.name, status: d.status, records: [] }));
  return out;
}

/** «Comprobar ahora» de un dominio de su cuenta. */
export async function verifyOwnDomain(admin: AdminContext, id: string): Promise<boolean> {
  if (!can(admin.session.role).manageTenant) throw new AdminError(403, 'Sin permiso para esta operación');
  const rt = await leadsRuntime();
  if ('error' in rt) throw new AdminError(503, RESEND_KEY_ERRORS.notConfigured);
  if (rt.demo) return true;
  const key = open(await rt.db.resendKey(admin.session.tenantId).catch(() => null), rt.secret);
  if (!key) return false;
  return resendVerifyDomain(key, id);
}
