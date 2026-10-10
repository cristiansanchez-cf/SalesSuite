/**
 * Contacto de cada persona en sus propuestas (docs/PERSONALIZE.md §Contacto del comercial). Va POR ESPACIO, en su membresía
 * (membership.contact_channel / contact_value): el admin de otro espacio no puede cambiar el que ven los clientes de este.
 * Cada uno pone el suyo (RPC set_my_contact) y un admin el de su equipo (set_member_contact), siempre en este espacio.
 */
import { demoDb } from '../data/store';
import { AdminError } from './service';
import { CONTACT_CHANNELS, type ContactChannel, type RepContact } from '../contact';

type Admin = NonNullable<App.Locals['admin']>;
/** Canal elegido y valor (puede estar vacío: canal puesto, número pendiente). */
export interface ContactSetting { channel: ContactChannel | null; value: string; name: string }

const isChannel = (c: unknown): c is ContactChannel => (CONTACT_CHANNELS as readonly unknown[]).includes(c);

export async function readContact(admin: Admin, userId: string): Promise<ContactSetting> {
  if (admin.mode === 'supabase' && admin.supabase) {
    const [{ data: m }, { data: u }] = await Promise.all([
      admin.supabase.from('membership').select('contact_channel, contact_value').eq('tenant_id', admin.session.tenantId).eq('user_id', userId).maybeSingle(),
      admin.supabase.from('users').select('display_name').eq('id', userId).maybeSingle(),
    ]);
    const r = (m ?? {}) as { contact_channel?: string | null; contact_value?: string | null };
    return { channel: isChannel(r.contact_channel) ? r.contact_channel : null, value: r.contact_value ?? '', name: (u as { display_name?: string | null } | null)?.display_name ?? '' };
  }
  const u = demoDb().users.find((x) => x.id === userId);
  const m = u?.memberships.find((x) => x.tenant_id === admin.session.tenantId);
  return { channel: isChannel(m?.contact_channel) ? m.contact_channel : null, value: m?.contact_value ?? '', name: u?.display_name ?? '' };
}

/** El contacto que sale en la propuesta: solo con canal y valor. */
export const toRep = (c: ContactSetting): RepContact | null => (c.channel && c.value.trim() ? { name: c.name, channel: c.channel, value: c.value.trim() } : null);

/** null = válido. Número para WhatsApp y teléfono, email con @; usuario, ID o enlace para el resto. */
export function contactError(channel: ContactChannel, value: string): 'phone' | 'email' | null {
  const v = value.trim();
  if (!v) return null;
  if ((channel === 'whatsapp' || channel === 'phone') && !/^\+?[\d\s().-]{6,39}$/.test(v)) return 'phone';
  if (channel === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'email';
  return null;
}

/** Guarda el contacto propio, o (admin del espacio) el de alguien de su equipo. */
export async function saveContact(admin: Admin, channel: string, value: string, userId = admin.session.userId): Promise<void> {
  const ch = isChannel(channel) ? channel : null;
  const v = ch ? value.trim().slice(0, 200) : '';
  const self = userId === admin.session.userId;
  if (!self && admin.session.role !== 'admin') throw new AdminError(403, 'Solo un admin pone el contacto de otra persona');
  if (admin.mode === 'supabase' && admin.supabase) {
    const { error } = self
      ? await admin.supabase.rpc('set_my_contact', { p_tenant: admin.session.tenantId, p_channel: ch ?? '', p_value: v })
      : await admin.supabase.rpc('set_member_contact', { p_tenant: admin.session.tenantId, p_user: userId, p_channel: ch ?? '', p_value: v });
    if (error) throw error;
    return;
  }
  const m = demoDb().users.find((x) => x.id === userId)?.memberships.find((x) => x.tenant_id === admin.session.tenantId);
  if (!m) throw new AdminError(403, 'No es del equipo');
  m.contact_channel = ch; m.contact_value = v || null;
}
