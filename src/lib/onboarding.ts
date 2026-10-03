/** Bienvenida paso a paso (/admin/welcome): ¿la ha terminado esta persona en este espacio? (users.onboarding) */
import type { AdminContext } from './admin/auth';
import { demoDb } from './data/store';

export async function onboardedAt(admin: AdminContext): Promise<string | null> {
  const { userId, tenantId } = admin.session;
  if (admin.mode === 'supabase' && admin.supabase) {
    const { data, error } = await admin.supabase.from('users').select('onboarding').eq('id', userId).maybeSingle();
    // Migración pendiente: se trata como terminada para no mandar a nadie a la bienvenida en bucle.
    if (error) return 'unknown';
    return ((data?.onboarding as Record<string, string> | null) ?? {})[tenantId] ?? null;
  }
  return demoDb().users.find((u) => u.id === userId)?.onboarding?.[tenantId] ?? null;
}

export async function markOnboarded(admin: AdminContext): Promise<void> {
  const { userId, tenantId } = admin.session;
  const at = new Date().toISOString();
  if (admin.mode === 'supabase' && admin.supabase) {
    const { data } = await admin.supabase.from('users').select('onboarding').eq('id', userId).maybeSingle();
    const next = { ...((data?.onboarding as Record<string, string> | null) ?? {}), [tenantId]: at };
    const { error } = await admin.supabase.from('users').update({ onboarding: next }).eq('id', userId);
    if (error) console.error('[onboarding]', error.message);
    return;
  }
  const u = demoDb().users.find((x) => x.id === userId);
  if (u) u.onboarding = { ...(u.onboarding ?? {}), [tenantId]: at };
}
