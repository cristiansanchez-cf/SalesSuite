/**
 * Datos del calendario (docs/CALENDAR.md): el enlace secreto de cada persona y, con él, sus próximos pasos de todas sus
 * empresas (espacios). El enlace se lee sin sesión (lo pide Outlook o Google): se busca con service role y solo se
 * devuelve lo de su dueño.
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { demoDb } from '../data/store';
import { env } from '../env';
import { appMode } from '../mode';
import type { CalItem } from './ics';

type Admin = NonNullable<App.Locals['admin']>;
export interface Feed { userId: string; timezone: string; locale: string; items: CalItem[] }

/** Su enlace (lo crea si no tiene; rotate: uno nuevo y el anterior deja de valer). null: aún sin la migración. */
export async function myCalendarToken(admin: Admin, rotate = false): Promise<string | null> {
  if (admin.mode === 'supabase' && admin.supabase) {
    const { data, error } = await admin.supabase.rpc('my_calendar_token', { p_rotate: rotate });
    return error ? null : (data as string);
  }
  const s = demoDb();
  const cur = s.calendar_feed.find((x) => x.user_id === admin.session.userId);
  if (cur && !rotate) return cur.token;
  const token = randomBytes(24).toString('hex');
  s.calendar_feed = [...s.calendar_feed.filter((x) => x.user_id !== admin.session.userId), { user_id: admin.session.userId, token }];
  return token;
}
/** ¿Tiene ya enlace? (sin crearlo). */
export async function hasCalendar(admin: Admin): Promise<string | null> {
  if (admin.mode === 'supabase' && admin.supabase) {
    const { data } = await admin.supabase.from('calendar_feed').select('token').eq('user_id', admin.session.userId).maybeSingle();
    return (data?.token as string) ?? null;
  }
  return demoDb().calendar_feed.find((x) => x.user_id === admin.session.userId)?.token ?? null;
}
export async function dropCalendar(admin: Admin): Promise<void> {
  if (admin.mode === 'supabase' && admin.supabase) { await admin.supabase.rpc('drop_my_calendar'); return; }
  const s = demoDb();
  s.calendar_feed = s.calendar_feed.filter((x) => x.user_id !== admin.session.userId);
}

const FROM_DAYS = 60, TO_DAYS = 400;
const urlOf = (base: string, kind: CalItem['kind'], id: string) => `${base}/admin/${kind === 'account' ? 'accounts' : 'dossiers'}/${id}`;

/** El calendario de quien tiene ese enlace; null si no existe. */
export async function feedFor(token: string, fallbackOrigin: string, now = new Date()): Promise<Feed | null> {
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return null;
  const from = new Date(now.getTime() - FROM_DAYS * 86_400_000).toISOString(), to = new Date(now.getTime() + TO_DAYS * 86_400_000).toISOString();
  if (appMode() === 'demo') return demoFeed(token, fallbackOrigin, from, to);
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return null;
  const sb = createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: f } = await sb.from('calendar_feed').select('user_id').eq('token', token).maybeSingle();
  if (!f) return null;
  const userId = f.user_id as string;
  const [{ data: u }, { data: ms }] = await Promise.all([
    sb.from('users').select('timezone, locale').eq('id', userId).maybeSingle(),
    sb.from('membership').select('tenant_id, role').eq('user_id', userId),
  ]);
  // Solo de los espacios donde sigue (y no como colaborador).
  const tenantIds = (ms ?? []).filter((m) => m.role !== 'partner').map((m) => m.tenant_id as string);
  if (!tenantIds.length) return { userId, timezone: (u?.timezone as string) || 'Europe/Madrid', locale: (u?.locale as string) || 'es', items: [] };
  const [{ data: ts }, { data: ds }, { data: accs }, { data: dos }] = await Promise.all([
    sb.from('tenant').select('id, name').in('id', tenantIds),
    sb.from('domain').select('tenant_id, hostname').in('tenant_id', tenantIds).eq('is_primary', true),
    sb.from('account').select('id, tenant_id, name, next_step, next_step_at, next_channel, contact:crm_contact!account_next_contact_fk(name)')
      .in('tenant_id', tenantIds).eq('owner_id', userId).gte('next_step_at', from).lt('next_step_at', to).limit(2000),
    sb.from('dossier').select('id, tenant_id, title, prospect_company, next_step, next_step_at')
      .in('tenant_id', tenantIds).eq('author_id', userId).eq('outcome', 'open').neq('status', 'archived').gte('next_step_at', from).lt('next_step_at', to).limit(2000),
  ]);
  const name = new Map((ts ?? []).map((t) => [t.id as string, t.name as string]));
  const base = (t: string) => { const h = (ds ?? []).find((d) => d.tenant_id === t)?.hostname as string | undefined; return h ? `https://${h}` : fallbackOrigin; };
  const items: CalItem[] = [
    ...(accs ?? []).map((a) => ({ kind: 'account' as const, id: a.id as string, tenant: name.get(a.tenant_id as string) ?? '', name: a.name as string, step: (a.next_step as string) ?? null,
      at: a.next_step_at as string, channel: (a.next_channel as string) ?? null, contact: ((a.contact as { name?: string } | null)?.name) ?? null, url: urlOf(base(a.tenant_id as string), 'account', a.id as string) })),
    ...(dos ?? []).map((d) => ({ kind: 'dossier' as const, id: d.id as string, tenant: name.get(d.tenant_id as string) ?? '', name: (d.prospect_company as string) || (d.title as string), step: (d.next_step as string) ?? null,
      at: d.next_step_at as string, channel: null, contact: null, url: urlOf(base(d.tenant_id as string), 'dossier', d.id as string) })),
  ];
  return { userId, timezone: (u?.timezone as string) || 'Europe/Madrid', locale: (u?.locale as string) || 'es', items };
}

function demoFeed(token: string, origin: string, from: string, to: string): Feed | null {
  const s = demoDb();
  const f = s.calendar_feed.find((x) => x.token === token);
  if (!f) return null;
  const u = s.users.find((x) => x.id === f.user_id);
  const tenantIds = (u?.memberships ?? []).filter((m) => m.role !== 'partner').map((m) => m.tenant_id);
  const tname = (t: string) => s.tenant.find((x) => x.id === t)?.name ?? '';
  const inRange = (x: string | null | undefined) => !!x && x >= from && x < to;
  const items: CalItem[] = [
    ...s.account.filter((a) => tenantIds.includes(a.tenant_id) && a.owner_id === f.user_id && inRange(a.next_step_at)).map((a) => ({
      kind: 'account' as const, id: a.id, tenant: tname(a.tenant_id), name: a.name, step: a.next_step ?? null, at: a.next_step_at!, channel: a.next_channel ?? null,
      contact: (a.next_contact_id ? s.crm_contact.find((c) => c.id === a.next_contact_id)?.name : null) ?? null, url: urlOf(origin, 'account', a.id),
    })),
    ...s.dossier.filter((d) => tenantIds.includes(d.tenant_id) && d.author_id === f.user_id && (d.outcome ?? 'open') === 'open' && d.status !== 'archived' && inRange(d.next_step_at)).map((d) => ({
      kind: 'dossier' as const, id: d.id, tenant: tname(d.tenant_id), name: d.prospect_company || d.title, step: d.next_step ?? null, at: d.next_step_at!, channel: null, contact: null, url: urlOf(origin, 'dossier', d.id),
    })),
  ];
  return { userId: f.user_id, timezone: u?.timezone || 'Europe/Madrid', locale: u?.locale || 'es', items };
}
