import type { APIRoute } from 'astro';
import { isLocale, LOCALE_COOKIE } from '~/lib/i18n';

/** Cambiar el idioma de la consola (docs/I18N.md): se guarda en la cuenta y en una cookie; vuelve a la misma pantalla. */
export const POST: APIRoute = async ({ request, locals, cookies, redirect, url }) => {
  const f = await request.formData();
  const locale = String(f.get('locale') ?? '');
  const back = String(f.get('back') ?? '/admin');
  if (isLocale(locale)) {
    if (locals.admin) await locals.admin.notifications.setLocale(locale);
    cookies.set(LOCALE_COOKIE, locale, { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 60 * 60 * 24 * 365 });
  }
  return redirect(/^\/admin(\/|\?|$)/.test(back) && !back.startsWith('//') ? back : '/admin', 303);
};
