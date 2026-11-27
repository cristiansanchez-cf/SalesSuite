/** Lo que «Tu CRM en marcha» necesita saber de quien entra: su móvil y el enlace del asistente de WhatsApp. */
import type { AdminContext } from './admin/auth';
import { appMode } from './mode';
import { demoDb } from './data/store';
import { leadsRuntime } from './leads/server';
import { assistantContact } from './assistant/contact';

export async function assistantFacts(admin: AdminContext): Promise<{ hasPhone: boolean; waLink: string | null }> {
  const demo = appMode() === 'demo';
  const phone = admin.mode === 'supabase' && admin.supabase
    ? ((await admin.supabase.from('users').select('phone').eq('id', admin.session.userId).maybeSingle()).data?.phone as string | null) ?? null
    : demoDb().users.find((x) => x.id === admin.session.userId)?.phone ?? null;
  const rt = await leadsRuntime();
  const settings = 'error' in rt ? null : await rt.db.settings(admin.session.tenantId).catch(() => null);
  const contact = await assistantContact(settings, { demo }).catch(() => null);
  return { hasPhone: !!phone, waLink: contact && contact.mode !== 'off' ? contact.waLink : null };
}
