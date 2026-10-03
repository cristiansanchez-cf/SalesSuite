import type { DossierStatus } from '../types';
import { INTL_LOCALE, type Locale } from '../i18n/core';

/** Estado del dossier en cada idioma de la consola (docs/I18N.md). STATUS_LABEL es el español. */
export const STATUS_LABELS: Record<Locale, Record<DossierStatus, string>> = {
  es: { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' },
  en: { draft: 'Draft', published: 'Published', archived: 'Archived' },
  pt: { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' },
  ko: { draft: '초안', published: '게시됨', archived: '보관됨' },
};
export const STATUS_LABEL: Record<DossierStatus, string> = STATUS_LABELS.es;
/** Badges del design system (console.css). Publicado = tinta; borrador = borde; archivado = apagado. */
export const STATUS_CLASS: Record<DossierStatus, string> = {
  draft: 'co-badge',
  published: 'co-badge co-badge--ink',
  archived: 'co-badge co-badge--soft',
};

/** Tiempo relativo en días como máximo («hace 3 días»). Sin `locale`, en español. */
export function relativeTime(iso: string | null, now = Date.now(), locale: Locale = 'es'): string {
  if (!iso) return '—';
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'es' ? 'es' : INTL_LOCALE[locale], { numeric: 'auto' });
  if (Math.abs(s) < 60) return rtf.format(-s, 'second');
  if (Math.abs(s) < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
