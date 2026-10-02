import type { DossierStatus } from '../types';

export const STATUS_LABEL: Record<DossierStatus, string> = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' };
export const STATUS_CLASS: Record<DossierStatus, string> = {
  draft: 'bg-amber-100 text-amber-900',
  published: 'bg-emerald-100 text-emerald-900',
  archived: 'bg-zinc-200 text-zinc-700',
};

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  if (Math.abs(s) < 60) return rtf.format(-s, 'second');
  if (Math.abs(s) < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
