/**
 * Idioma de la petición en curso, para lo que no recibe `Astro` (los errores del servidor, errors.ts).
 * El middleware lo fija para toda la petición; fuera de una petición (tests, scripts) es español.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { DEFAULT_LOCALE, type Locale } from './core';

const store = new AsyncLocalStorage<Locale>();

export const withRequestLocale = <R>(locale: Locale, fn: () => R): R => store.run(locale, fn);
export const requestLocale = (): Locale => store.getStore() ?? DEFAULT_LOCALE;
