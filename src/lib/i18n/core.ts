/**
 * Idiomas de la consola (docs/I18N.md): español (fuente), inglés, portugués y coreano.
 * Los mensajes en español definen la forma; si a otro idioma le falta una clave o cambia la firma
 * de una función, falla el typecheck (`astro check`).
 */
export const LOCALES = ['es', 'en', 'pt', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALE_NAME: Record<Locale, string> = { es: 'Español', en: 'English', pt: 'Português', ko: '한국어' };
/** Etiqueta BCP-47 para Intl (fechas, números, moneda). */
export const INTL_LOCALE: Record<Locale, string> = { es: 'es-ES', en: 'en-GB', pt: 'pt-BR', ko: 'ko-KR' };

export const isLocale = (x: unknown): x is Locale => typeof x === 'string' && (LOCALES as readonly string[]).includes(x);

/** Misma forma que el español: textos o funciones (plurales, parámetros) con la misma firma. */
export type Shape<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends (...a: infer A) => string ? (...a: A) => string : Shape<T[K]>;
};

/** Un grupo de mensajes por pantalla o área, con los cuatro idiomas juntos (ver messages/*.ts). */
export function defineMessages<T>(m: { es: T; en: Shape<T>; pt: Shape<T>; ko: Shape<T> }): Record<Locale, T> {
  return m as Record<Locale, T>;
}

/** Mejor idioma de Accept-Language («pt-BR,pt;q=0.9,en;q=0.8» → pt). */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const prefs = header.split(',').map((part) => {
    const [tag, ...params] = part.trim().split(';');
    const q = Number(params.find((p) => p.trim().startsWith('q='))?.split('=')[1] ?? '1');
    return { lang: tag.trim().slice(0, 2).toLowerCase(), q: Number.isFinite(q) ? q : 0 };
  }).sort((a, b) => b.q - a.q);
  return prefs.find((p) => isLocale(p.lang))?.lang as Locale ?? null;
}

/**
 * Lo que elige cada uno (guardado en su cuenta o en la cookie) → idioma del espacio → español.
 * El idioma del navegador no decide: la app sale en español salvo que alguien elija otro (selector de idioma).
 */
export function resolveLocale(o: { user?: string | null; cookie?: string | null; tenant?: string | null; accept?: string | null }): Locale {
  for (const c of [o.user, o.cookie]) if (isLocale(c)) return c;
  const t = o.tenant?.slice(0, 2).toLowerCase();
  return isLocale(t) ? t : DEFAULT_LOCALE;
}

/** Formateadores en el idioma de quien mira. */
export function formatters(locale: Locale) {
  const tag = INTL_LOCALE[locale];
  return {
    tag,
    money: (cents: number, currency = 'EUR') => new Intl.NumberFormat(tag, { style: 'currency', currency }).format(cents / 100),
    date: (iso: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => (iso ? new Intl.DateTimeFormat(tag, opts).format(new Date(iso)) : ''),
    relative: (iso: string | null, now = Date.now()) => {
      if (!iso) return '—';
      const s = Math.round((Date.parse(iso) - now) / 1000);
      const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
      const a = Math.abs(s);
      if (a < 60) return rtf.format(s, 'second');
      if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
      if (a < 86_400) return rtf.format(Math.round(s / 3600), 'hour');
      if (a < 30 * 86_400) return rtf.format(Math.round(s / 86_400), 'day');
      if (a < 365 * 86_400) return rtf.format(Math.round(s / (30 * 86_400)), 'month');
      return rtf.format(Math.round(s / (365 * 86_400)), 'year');
    },
    number: (n: number) => new Intl.NumberFormat(tag).format(n),
  };
}
