/**
 * Smoke de aislamiento entre espacios (por HTTP, como lo vería alguien que conoce los ids): desde otro espacio no se
 * abre ninguna empresa, persona, propuesta ni aviso de Enjoy, ni por la página ni por la API; sin ser del espacio no se
 * entra aunque se fuerce la galleta de espacio de la demo; el enlace público de un espacio no abre en otro.
 * Solo lee: se puede poner en cualquier punto de la lista de CI.
 *   npm run build && npm run start:demo ; node scripts/smoke-isolation.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

// Datos de Enjoy del seed demo (src/lib/data/store.ts y supabase/seed/fixtures.json).
const ENJOY = {
  account: '00000000-0000-4000-8000-0000000ac001',   // Club Sol
  person: '00000000-0000-4000-8000-0000000cc501',    // Marta Ruiz
  dossier: '00000000-0000-4000-8000-000000d05501',   // Sala X
  notification: '00000000-0000-4000-8000-0000009d0001',
  token: 'demo-sala-x-7Qm2',
};
const ALT = { id: '00000000-0000-4000-8000-000000000a01', slug: 'retheme-test', token: 'demo-retheme-Hx8v' };
/** Textos que solo están en datos de Enjoy: no pueden salir en ninguna respuesta desde otro espacio. */
const LEAKS = ['Marta Ruiz', '611 222 333', 'Tiene DJ residente los viernes', 'Club Sol', 'Añadir el coste por invitado'];

(async () => {
  const b = await chromium.launch();
  const login = async (email, space) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    if (space) await ctx.addCookies([{ name: 'ss_demo_tenant', value: space, url: BASE }]);
    return { ctx, p };
  };
  const leaks = (body) => LEAKS.filter((x) => body.includes(x));

  // ---- Comercial de otro espacio, en el suyo: los ids de Enjoy no abren nada.
  const alt = await login('rep@retheme.test', ALT.slug);
  const home = await alt.ctx.request.get(`${BASE}/admin/inicio`);
  assert(home.status() === 200, `entra en su espacio (${home.status()})`);
  assert(!leaks(await home.text()).length, 'su inicio no enseña nada de Enjoy');
  for (const path of [`/admin/accounts/${ENJOY.account}`, `/admin/people/${ENJOY.person}`, `/admin/dossiers/${ENJOY.dossier}`,
    `/admin/dossiers/${ENJOY.dossier}/debrief`, `/admin/dossiers/${ENJOY.dossier}/analytics`, `/admin/api/dossiers/${ENJOY.dossier}`]) {
    const r = await alt.ctx.request.get(`${BASE}${path}`, { maxRedirects: 0 });
    const body = await r.text();
    assert([302, 303, 403, 404].includes(r.status()) && !leaks(body).length, `otro espacio no abre ${path} (${r.status()}${leaks(body).length ? `, filtra: ${leaks(body)}` : ''})`);
  }
  // Un aviso de Enjoy por su id: no se abre (vuelve a la lista de avisos) y no se marca como leído.
  const n = await alt.ctx.request.get(`${BASE}/admin/notifications/${ENJOY.notification}`, { maxRedirects: 0 });
  assert(!leaks(await n.text()).length, `un aviso de Enjoy no se abre desde otro espacio (${n.status()})`);
  for (const path of ['/admin', '/admin/accounts', '/admin/people', '/admin/notifications', '/admin/accounts/tablero']) {
    const r = await alt.ctx.request.get(`${BASE}${path}`);
    assert(r.status() === 200 && !leaks(await r.text()).length, `las listas de su espacio no traen nada de Enjoy (${path}, ${r.status()})`);
  }

  // ---- Control: desde Enjoy, esas mismas páginas sí enseñan esos datos (si no, lo de arriba no probaría nada).
  const own = await login('rep@enjoy.test');
  const ownPerson = await own.ctx.request.get(`${BASE}/admin/people/${ENJOY.person}`);
  assert(ownPerson.status() === 200 && leaks(await ownPerson.text()).includes('Marta Ruiz'), 'control: en Enjoy, la ficha de Marta sí abre');
  const ownAccount = await own.ctx.request.get(`${BASE}/admin/accounts/${ENJOY.account}`);
  assert(ownAccount.status() === 200 && leaks(await ownAccount.text()).includes('Club Sol'), 'control: en Enjoy, Club Sol sí abre');

  // ---- Sin ser del espacio: forzar la galleta de la demo no da acceso, ni «Cambiar de espacio» tampoco.
  const rep = await login('rep@enjoy.test', ALT.slug);
  const forced = await rep.ctx.request.get(`${BASE}/admin/inicio`, { maxRedirects: 0 });
  assert(forced.status() === 403, `la galleta de otro espacio sin ser miembro → 403 (${forced.status()})`);
  const api = await rep.ctx.request.get(`${BASE}/admin/api/dossiers/00000000-0000-4000-8000-000000d05504`, { maxRedirects: 0 });
  assert(api.status() === 403, `y la API de ese espacio tampoco (${api.status()})`);
  await rep.ctx.clearCookies({ name: 'ss_demo_tenant' });
  const sw = await rep.ctx.request.post(`${BASE}/admin/switch`, { form: { tenant: ALT.id }, headers: { origin: BASE }, maxRedirects: 0 });
  const cookies = await rep.ctx.cookies(BASE);
  assert(!cookies.some((c) => c.name === 'ss_demo_tenant'), `«Cambiar de espacio» a uno en el que no estás no hace nada (${sw.status()})`);

  // ---- Sin sesión: la API no responde.
  const anon = await b.newContext();
  const r401 = await anon.request.get(`${BASE}/admin/api/dossiers/${ENJOY.dossier}`, { maxRedirects: 0 });
  assert(r401.status() === 401, `sin sesión, la API de la consola → 401 (${r401.status()})`);

  // ---- Enlace público: el de Enjoy abre en Enjoy; el de otro espacio, no.
  const pub = await anon.request.get(`${BASE}/d/${ENJOY.token}`);
  assert(pub.status() === 200, `el enlace público de Enjoy abre (${pub.status()})`);
  const other = await anon.request.get(`${BASE}/d/${ALT.token}`);
  assert(other.status() === 404, `el enlace de otro espacio no abre en Enjoy (${other.status()})`);

  await b.close();
})();
