/**
 * Texto, enlace e icono de cada tipo de aviso. El aviso guarda el tipo y sus datos, no la frase:
 * así se pinta en el idioma de quien lo lee (docs/NOTIFICATIONS.md).
 */
import type { IconName } from '../ui/icons';
import type { Notification, NotificationView } from './types';
import { formatters, type Locale } from '../i18n/core';
import { notifyMessages } from '../i18n/messages/notify';

interface KindDef {
  icon: IconName;
  /** Se da por atendido al abrirlo (no hay un hecho posterior que lo resuelva). */
  resolvesOnRead: boolean;
  href(n: Notification): string;
}

export const KINDS: Record<string, KindDef> = {
  contribution_pending: { icon: 'lightbulb', resolvesOnRead: false, href: () => '/admin/playbook?tab=inbox' },
  partner_referred: { icon: 'user-plus', resolvesOnRead: true, href: (n) => `/admin/team/partners/${n.entityKey}` },
  member_added: { icon: 'users', resolvesOnRead: true, href: () => '/admin/team' },
  account_conflict: { icon: 'shield-alert', resolvesOnRead: false, href: (n) => `/admin/dossiers/${n.entityKey}` },
  sale_to_confirm: { icon: 'wallet', resolvesOnRead: false, href: () => '/admin/commissions/team?tab=ingresos' },
  payout_ready: { icon: 'wallet', resolvesOnRead: true, href: () => '/admin/commissions' },
  payout_paid: { icon: 'circle-check', resolvesOnRead: true, href: () => '/admin/commissions' },
  story_shared: { icon: 'trophy', resolvesOnRead: true, href: () => '/admin/wins' },
};

const FALLBACK: KindDef = { icon: 'info', resolvesOnRead: true, href: () => '/admin/notifications' };

const str = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v == null ? '' : String(v)]));

/** Frase y detalle en el idioma de quien lo lee. */
function texts(n: Notification, locale: Locale): { title: string; detail: string | null } {
  const m = notifyMessages[locale];
  const p = str(n.params);
  const money = formatters(locale).money(Number(p.amount || 0), p.currency || 'EUR');
  switch (n.kind) {
    case 'contribution_pending': return { title: m.contribution_pending.title(p), detail: p.title ? `«${p.title}»` : null };
    case 'partner_referred': return { title: m.partner_referred.title(p), detail: m.partner_referred.detail };
    case 'member_added': return { title: m.member_added.title(p, (m.role as Record<string, string>)[p.role] ?? p.role), detail: null };
    case 'account_conflict': return { title: m.account_conflict.title(p, (m.reason as Record<string, string>)[p.reason] ?? m.reason.other), detail: m.account_conflict.detail(p) };
    case 'sale_to_confirm': return { title: m.sale_to_confirm.title(p, money), detail: m.sale_to_confirm.detail };
    case 'payout_ready': return { title: m.payout_ready.title(p, money), detail: m.payout_ready.detail };
    case 'payout_paid': return { title: m.payout_paid.title(p, money), detail: null };
    case 'story_shared': return { title: m.story_shared.title(p), detail: p.title ? `«${p.title}»` : null };
    default: return { title: m.fallback, detail: null };
  }
}

/** ¿Sigue pidiendo algo? (campana, email inmediato y resumen semanal usan la misma regla). */
export function isOpen(n: Notification): boolean {
  if (n.dismissedAt) return false;
  const def = KINDS[n.kind] ?? FALLBACK;
  if (n.severity === 'info' || def.resolvesOnRead) return !n.readAt;
  return !n.resolvedAt;
}

export function renderNotification(n: Notification, locale: Locale = 'es'): NotificationView {
  const def = KINDS[n.kind] ?? FALLBACK;
  return { ...n, ...texts(n, locale), href: def.href(n), icon: def.icon, open: isOpen(n) };
}
