/**
 * Texto, enlace e icono de cada tipo de aviso. El aviso guarda el tipo y sus datos, no la frase:
 * así se pinta en el idioma de quien lo lee (docs/NOTIFICATIONS.md).
 */
import type { IconName } from '../ui/icons';
import type { Notification, NotificationView } from './types';

interface KindDef {
  icon: IconName;
  /** Se da por atendido al abrirlo (no hay un hecho posterior que lo resuelva). */
  resolvesOnRead: boolean;
  title(p: Record<string, string>): string;
  detail?(p: Record<string, string>): string | null;
  href(n: Notification): string;
}

const money = (cents: string, currency: string) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(Number(cents || 0) / 100);
const REASON: Record<string, string> = {
  claimed_by_other: 'la trabajaba otra persona', blocked: 'la cuenta está bloqueada', out_of_zone: 'está fuera de su zona', no_account: 'no tiene cuenta del CRM',
};
const ROLE: Record<string, string> = { admin: 'admin', lead: 'jefe/a de ventas', rep: 'comercial', partner: 'colaborador/a' };

export const KINDS: Record<string, KindDef> = {
  contribution_pending: {
    icon: 'lightbulb', resolvesOnRead: false,
    title: (p) => `${p.author || 'Alguien del equipo'} propone ${p.type === 'change' ? 'una mejora' : 'un truco'} para el playbook`,
    detail: (p) => (p.title ? `«${p.title}»` : null),
    href: () => '/admin/playbook?tab=inbox',
  },
  partner_referred: {
    icon: 'user-plus', resolvesOnRead: true,
    title: (p) => `${p.name || 'Un colaborador nuevo'} se ha unido, invitado por ${p.inviter || 'otro colaborador'}`,
    detail: () => 'Revisa sus módulos y asígnale cuentas.',
    href: (n) => `/admin/team/partners/${n.entityKey}`,
  },
  member_added: {
    icon: 'users', resolvesOnRead: true,
    title: (p) => `${p.inviter || 'Tu jefe/a de ventas'} ha añadido a ${p.name || 'alguien'} como ${ROLE[p.role] ?? p.role}`,
    href: () => '/admin/team',
  },
  account_conflict: {
    icon: 'shield-alert', resolvesOnRead: false,
    title: (p) => `${p.seller || 'Alguien'} ha ganado ${p.account ? `«${p.account}»` : 'una venta'}, pero ${REASON[p.reason] ?? 'no cumple las reglas'}`,
    detail: (p) => `Sin comisión hasta que decidas${p.holder && p.reason === 'claimed_by_other' ? ` · la trabajaba ${p.holder}` : ''}${p.blockedReason ? ` · ${p.blockedReason}` : ''}.`,
    href: (n) => `/admin/dossiers/${n.entityKey}`,
  },
  sale_to_confirm: {
    icon: 'wallet', resolvesOnRead: false,
    title: (p) => `${p.seller || 'Alguien'} declara una venta de ${money(p.amount, p.currency)}${p.offer ? ` (${p.offer})` : ''}`,
    detail: () => 'Confírmala para que cuente en las comisiones.',
    href: () => '/admin/commissions?tab=ingresos',
  },
  payout_ready: {
    icon: 'wallet', resolvesOnRead: true,
    title: (p) => `Tu liquidación de ${p.period}: ${money(p.amount, p.currency)}`,
    detail: () => 'Está lista para pago.',
    href: () => '/admin/commissions/mine',
  },
  payout_paid: {
    icon: 'circle-check', resolvesOnRead: true,
    title: (p) => `Pagado: ${money(p.amount, p.currency)} de ${p.period}`,
    href: () => '/admin/commissions/mine',
  },
  story_shared: {
    icon: 'trophy', resolvesOnRead: true,
    title: (p) => `${p.author || 'El equipo'} ha documentado ${p.outcome === 'lost' ? 'una venta perdida' : 'un cierre ganado'}`,
    detail: (p) => (p.title ? `«${p.title}»` : null),
    href: () => '/admin/wins',
  },
};

const FALLBACK: KindDef = { icon: 'info', resolvesOnRead: true, title: () => 'Novedad en tu espacio', href: () => '/admin/notifications' };

const str = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v == null ? '' : String(v)]));

/** ¿Sigue pidiendo algo? (campana, email inmediato y resumen semanal usan la misma regla). */
export function isOpen(n: Notification): boolean {
  if (n.dismissedAt) return false;
  const def = KINDS[n.kind] ?? FALLBACK;
  if (n.severity === 'info' || def.resolvesOnRead) return !n.readAt;
  return !n.resolvedAt;
}

export function renderNotification(n: Notification): NotificationView {
  const def = KINDS[n.kind] ?? FALLBACK;
  const p = str(n.params);
  return { ...n, title: def.title(p), detail: def.detail?.(p) ?? null, href: def.href(n), icon: def.icon, open: isOpen(n) };
}
