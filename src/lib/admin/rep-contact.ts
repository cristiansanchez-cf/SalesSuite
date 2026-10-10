/**
 * Contacto de cada persona en sus propuestas (users.contact_channel / contact_value, docs/PERSONALIZE.md §Contacto del comercial).
 * Se lee para la vista previa y el editor, y lo guarda cada uno en su perfil (política users_update_self).
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
    // Antes de la migración las columnas no existen: sin contacto propio.
    const { data } = await admin.supabase.from('users').select('display_name, contact_channel, contact_value').eq('id', userId).maybeSingle();
    const r = (data ?? {}) as { display_name?: string | null; contact_channel?: string | null; contact_value?: string | null };
    return { channel: isChannel(r.contact_channel) ? r.contact_channel : null, value: r.contact_value ?? '', name: r.display_name ?? '' };
  }
  const u = demoDb().users.find((x) => x.id === userId);
  return { channel: isChannel(u?.contact_channel) ? u.contact_channel : null, value: u?.contact_value ?? '', name: u?.display_name ?? '' };
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
      ? await admin.supabase.from('users').update({ contact_channel: ch, contact_value: v || null }).eq('id', userId)
      : await admin.supabase.rpc('set_member_contact', { p_tenant: admin.session.tenantId, p_user: userId, p_channel: ch ?? '', p_value: v });
    if (error) throw error;
    return;
  }
  const u = demoDb().users.find((x) => x.id === userId);
  if (u) { u.contact_channel = ch; u.contact_value = v || null; }
}
