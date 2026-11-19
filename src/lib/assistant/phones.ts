/**
 * Desde qué móvil escribe cada persona al asistente, por empresa (docs/ASSISTANT.md §Un móvil por empresa). Va en su
 * membresía (membership.assistant_phone); vacío = el de Mi cuenta. Cada uno solo ve y cambia los suyos (RPC
 * my_assistant_phones / set_my_assistant_phone).
 */
import { demoDb } from '../data/store';

type Admin = NonNullable<App.Locals['admin']>;
export interface SpacePhone { tenantId: string; name: string; phone: string | null }

export async function myAssistantPhones(admin: Admin): Promise<SpacePhone[]> {
  if (admin.mode === 'supabase' && admin.supabase) {
    const { data, error } = await admin.supabase.rpc('my_assistant_phones');
    // Sin la migración 20270105: como antes (un solo móvil).
    if (error) return [];
    return ((data ?? []) as Array<{ tenant_id: string; tenant_name: string; assistant_phone: string | null }>)
      .map((r) => ({ tenantId: r.tenant_id, name: r.tenant_name, phone: r.assistant_phone }));
  }
  const db = demoDb();
  const u = db.users.find((x) => x.id === admin.session.userId);
  return (u?.memberships ?? []).filter((m) => ['admin', 'lead', 'rep'].includes(m.role))
    .map((m) => ({ tenantId: m.tenant_id, name: db.tenant.find((t) => t.id === m.tenant_id)?.name ?? m.tenant_id, phone: m.assistant_phone ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function setMyAssistantPhone(admin: Admin, tenantId: string, phone: string | null): Promise<boolean> {
  if (admin.mode === 'supabase' && admin.supabase) {
    const { data, error } = await admin.supabase.rpc('set_my_assistant_phone', { p_tenant_id: tenantId, p_phone: phone });
    return !error && data === true;
  }
  const m = demoDb().users.find((x) => x.id === admin.session.userId)?.memberships.find((x) => x.tenant_id === tenantId && ['admin', 'lead', 'rep'].includes(x.role));
  if (!m) return false;
  m.assistant_phone = phone;
  return true;
}

export { formatPhone } from '../phone-format';
