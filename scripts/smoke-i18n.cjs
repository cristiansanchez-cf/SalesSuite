/**
 * Smoke de idiomas (docs/I18N.md): cambiar a inglés, portugués y coreano desde el menú de perfil y desde Mi cuenta;
 * la preferencia se guarda; el navegador decide antes de elegir.
 *   npm run build && npm run start:demo ; node scripts/smoke-i18n.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  // Navegador en portugués, sin preferencia guardada → portugués.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/notifications`);
  assert((await p.getAttribute('html', 'lang')) === 'pt' && (await p.textContent('nav[aria-label]')).includes('Início'), 'navegador en portugués → consola en portugués');

  // Menú de perfil → English.
  await p.click('[data-testid=profile]');
  await p.click('[data-testid=locale-en]');
  await p.waitForLoadState();
  assert((await p.getAttribute('html', 'lang')) === 'en' && (await p.textContent('.co-sidebar')).includes('My commissions'), 'cambio rápido a inglés');
  assert((await p.textContent('h1')).includes('Notifications'), 'vuelve a la misma pantalla, ya traducida');

  // Mi cuenta → 한국어; queda guardado aunque el navegador diga otra cosa.
  await p.goto(`${BASE}/admin/account`);
  await p.click('[data-testid=locale-pref] label[lang=ko]');
  await p.click('[data-testid=locale-pref] button[type=submit]');
  await p.waitForLoadState();
  assert((await p.getAttribute('html', 'lang')) === 'ko' && (await p.textContent('h1')).includes('내 계정'), 'Mi cuenta en coreano');
  if (OUT) await p.screenshot({ path: `${OUT}/i18n-ko.png`, fullPage: true });
  // Los errores del servidor también (src/lib/i18n/errors.ts).
  const err = await p.evaluate(() => fetch('/admin/api/dossiers/00000000-0000-4000-8000-000000000000/talk-track').then((r) => r.json()));
  assert(/[가-힣]/.test(err.error ?? ''), `error del servidor en coreano («${err.error}»)`);
  await ctx.clearCookies({ name: 'ss_locale' }).catch(() => {});
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/admin/login`);
  await p2.click('[data-testid="demo-rep@enjoy.test"]');
  await p2.waitForURL(/\/admin/);
  await p2.goto(`${BASE}/admin/notifications`);
  assert((await p2.getAttribute('html', 'lang')) === 'ko', 'la preferencia se guarda en la cuenta (no depende de la cookie)');

  // Volver a español para no afectar a otros smokes.
  await p2.goto(`${BASE}/admin/account`);
  await p2.click('[data-testid=locale-pref] label[lang=es]');
  await p2.click('[data-testid=locale-pref] button[type=submit]');
  await p2.waitForLoadState();
  assert((await p2.getAttribute('html', 'lang')) === 'es', 'de vuelta a español');
  await b.close();
})();
