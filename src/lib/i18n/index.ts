/**
 * Uso en páginas y componentes:
 *   const { m, f, locale } = i18n(Astro, shell);   // m = mensajes del grupo; f = formateadores
 * Cada grupo de mensajes vive en messages/<grupo>.ts con los cuatro idiomas (defineMessages).
 */
import { DEFAULT_LOCALE, formatters, type Locale } from './core';
export * from './core';

export const LOCALE_COOKIE = 'ss_locale';

export function i18n<T>(astro: { locals: { locale?: Locale } }, group: Record<Locale, T>) {
  const locale = astro.locals.locale ?? DEFAULT_LOCALE;
  return { locale, m: group[locale], f: formatters(locale) };
}
