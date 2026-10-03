// SPIKE (docs/SPIKE_DATA.md): permite correr los smokes SIN CAMBIARLOS contra la pila local en modo supabase.
// Los smokes hacen require(process.env.PLAYWRIGHT_MODULE || 'playwright') y entran pulsando
// [data-testid="demo-<email>"] (botones que solo existen en modo demo). Este envoltorio cambia ese clic
// por el formulario «Entrar con contraseña» con la clave de desarrollo del gateway local.
//   PLAYWRIGHT_MODULE=$PWD/spike/data/playwright-local-login.cjs node scripts/smoke-notifications.cjs
const real = require(process.env.PLAYWRIGHT_REAL || 'playwright');
const PASSWORD = process.env.DEV_PASSWORD || 'demo-local';
const DEMO = /\[data-testid="demo-([^"]+)"\]/;

async function passwordLogin(page, email) {
  await page.locator('details', { has: page.locator('input[name=password]') }).locator('summary').click();
  const form = page.locator('form', { has: page.locator('input[name=password]') });
  await form.locator('input[name=email]').fill(email);
  await form.locator('input[name=password]').fill(PASSWORD);
  await form.locator('button[type=submit]').click();
}
const wrapPage = (page) => new Proxy(page, {
  get(t, k) {
    if (k === 'click') return (sel, ...rest) => { const m = DEMO.exec(sel); return m ? passwordLogin(t, m[1]) : t.click(sel, ...rest); };
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  },
});
const wrapCtx = (ctx) => new Proxy(ctx, {
  get(t, k) {
    if (k === 'newPage') return async (...a) => wrapPage(await t.newPage(...a));
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  },
});
const wrapBrowser = (b) => new Proxy(b, {
  get(t, k) {
    if (k === 'newContext') return async (...a) => wrapCtx(await t.newContext(...a));
    if (k === 'newPage') return async (...a) => wrapPage(await t.newPage(...a));
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  },
});
module.exports = { ...real, chromium: { ...real.chromium, launch: async (...a) => wrapBrowser(await real.chromium.launch(...a)) } };
