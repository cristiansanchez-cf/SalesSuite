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

export interface ResendDomain { name: string; status: string }

/** Los dominios de esa cuenta y su estado (si la clave tiene permiso completo; con una de solo envío, null). */
export async function resendDomains(key: string, fetchImpl: typeof fetch = fetch): Promise<ResendDomain[] | null | 'invalid'> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetchImpl('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` }, signal: ctl.signal });
    if (r.status === 401 || r.status === 400) return 'invalid';
    if (!r.ok) return null; // 403: clave restringida a enviar → vale, pero no deja ver dominios
    const body = (await r.json()) as { data?: { name: string; status: string }[] };
    return (body.data ?? []).map((d) => ({ name: d.name, status: d.status }));
  } catch { return null; } finally { clearTimeout(t); }
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
