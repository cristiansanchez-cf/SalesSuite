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

/**
 * ¿Es el admin de un espacio todavía vacío (sin clientes ni actores)? Entonces lo primero no es la bienvenida
 * de comercial sino preparar la empresa (/admin/setup/ia). docs/SETUP_WIZARD.md §Con IA.
 */
export async function needsCompanySetup(admin: AdminContext): Promise<boolean> {
  if (admin.session.role !== 'admin') return false;
  const market = await admin.playbook.market().catch(() => [{}]);
  return market.length === 0;
}
