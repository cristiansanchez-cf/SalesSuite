/** Avisos de la persona que ha entrado: campana, página de avisos y preferencia de email. */
import type { AdminSession } from '../admin/types';
import type { NotifyDb } from './db';
import { renderNotification } from './render';
import type { NotificationView } from './types';

export interface NotificationFeed { items: NotificationView[]; open: number }

export function createNotifyService(db: NotifyDb, s: Pick<AdminSession, 'tenantId' | 'userId'>) {
  async function feed(opts: { limit?: number; onlyOpen?: boolean } = {}): Promise<NotificationFeed> {
    const all = (await db.list(s.tenantId, s.userId, { limit: 200 })).map(renderNotification);
    // Lo que pide algo primero (acción antes que información); luego lo más reciente.
    const rank = (n: NotificationView) => (n.open ? (n.severity === 'action' ? 0 : 1) : 2);
    const sorted = all.sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
    const items = (opts.onlyOpen ? sorted.filter((n) => n.open) : sorted.filter((n) => !n.dismissedAt)).slice(0, opts.limit ?? 50);
    return { items, open: all.filter((n) => n.open).length };
  }
  /** Abrir un aviso lo marca como leído y devuelve adónde ir. */
  async function open(id: string): Promise<string> {
    const n = (await db.list(s.tenantId, s.userId, { limit: 200 })).find((x) => x.id === id);
    if (!n) return '/admin/notifications';
    await db.markRead(s.tenantId, s.userId, [id]);
    return renderNotification(n).href;
  }
  return {
    feed,
    open,
    markAllRead: () => db.markRead(s.tenantId, s.userId, null),
    dismiss: (id: string) => db.dismiss(s.tenantId, s.userId, id),
    emailPref: () => db.getEmailPref(s.userId),
    setEmailPref: (on: boolean) => db.setEmailPref(s.userId, on),
  };
}
export type NotifyService = ReturnType<typeof createNotifyService>;

/** Para contextos sin avisos (tests de otros módulos). */
export const emptyNotifyDb: NotifyDb = {
  async list() { return []; }, async markRead() {}, async dismiss() { return false; },
  async getEmailPref() { return true; }, async setEmailPref() {},
};
