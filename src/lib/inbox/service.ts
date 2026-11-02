/**
 * Correos al CRM (docs/CRM_DINAMICO.md §47), lo que ve la persona: su dirección para reenviar o poner en copia, lo que ha
 * llegado y asignar a una empresa lo que llegó sin ella.
 */
import { AdminError } from '../admin/service';
import type { AdminContext } from '../admin/auth';
import { can } from '../admin/permissions';
import type { InboundEmail, InboxUserDb } from './db';

export const INBOX_ERRORS = { notFound: 'Correo no encontrado', done: 'Ese correo ya está apuntado' } as const;

export function createInboxService(db: InboxUserDb, admin: AdminContext, domain: string | null) {
  const s = admin.session;
  const requireUse = () => { if (!can(s.role).useAccounts || s.role === 'partner') throw new AdminError(403, 'Sin permiso para esta operación'); };

  /** «apuntar-<token>@dominio» (null si la plataforma aún no tiene dominio de entrada). */
  async function address(): Promise<string | null> {
    requireUse();
    if (!domain) return null;
    return `apuntar-${await db.myToken(s.tenantId)}@${domain}`;
  }
  async function rotate(): Promise<string | null> {
    requireUse();
    if (!domain) return null;
    return `apuntar-${await db.rotate(s.tenantId)}@${domain}`;
  }
  async function list(limit = 50): Promise<InboundEmail[]> {
    requireUse();
    return db.list(s.tenantId, s.userId, limit);
  }
  async function mine(id: string): Promise<InboundEmail> {
    const e = /^[0-9a-f-]{36}$/i.test(id) ? await db.get(id) : null;
    if (!e || e.userId !== s.userId || e.tenantId !== s.tenantId) throw new AdminError(404, INBOX_ERRORS.notFound);
    return e;
  }
  /** Lo que llegó sin empresa: se apunta en la elegida (con sus permisos de siempre). */
  async function assign(id: string, accountId: string) {
    requireUse();
    const e = await mine(id);
    if (e.status === 'logged') throw new AdminError(409, INBOX_ERRORS.done);
    await admin.crm.logActivity(accountId, { channel: 'email', outcome: e.direction === 'in' ? 'replied' : 'no_reply', note: e.snippet ?? e.subject ?? '', happenedAt: e.receivedAt });
    await db.update(id, { status: 'logged', accountId, detail: null });
  }
  async function ignore(id: string) {
    requireUse();
    await mine(id);
    await db.update(id, { status: 'ignored' });
  }
  return { address, rotate, list, assign, ignore, configured: !!domain };
}
export type InboxService = ReturnType<typeof createInboxService>;

/** El servicio con la sesión de la persona (Supabase) o la demo. */
export async function inboxFor(admin: AdminContext): Promise<InboxService> {
  const { inboxDomain } = await import('./server');
  if (admin.mode === 'demo' || !admin.supabase) {
    const { demoInboxUserDb } = await import('./db-demo');
    return createInboxService(demoInboxUserDb(admin.session.userId), admin, inboxDomain() ?? 'in.demo.cofundo.io');
  }
  const { supabaseInboxUserDb } = await import('./db-supabase');
  return createInboxService(supabaseInboxUserDb(admin.supabase), admin, inboxDomain());
}
