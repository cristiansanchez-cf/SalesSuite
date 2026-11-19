/**
 * Smoke del calendario (docs/CALENDAR.md): conectar en Mi cuenta → enlace .ics con los próximos pasos (sin hora, todo el
 * día; con hora, a esa hora); cambiar el enlace deja el anterior sin valer; desconectar.
 *   npm run build && npm run start:demo ; node scripts/smoke-calendar.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/account#calendario`);
  await p.click('[data-testid=calendar-connect]');
  const url = await p.inputValue('[data-testid=calendar-url]');
  assert(/\/cal\/[0-9a-f]{48}\.ics$/.test(url), `enlace personal (${url.replace(/[0-9a-f]{40}/, '…')})`);
  assert((await p.getAttribute('[data-testid=calendar-outlook]', 'href')).startsWith('https://outlook.office.com/calendar/0/addfromweb?url='), 'botón para Outlook');
  const r = await p.request.get(url);
  const ics = await r.text();
  assert(r.status() === 200 && (r.headers()['content-type'] || '').startsWith('text/calendar') && ics.startsWith('BEGIN:VCALENDAR'), 'el .ics se lee sin sesión de navegador');
  assert(/SUMMARY:Club Sol · Proponer una cita el jueves/.test(ics.replace(/\r\n /g, '')), 'su próximo paso en el calendario');
  // Sin sesión de verdad: otro contexto.
  const anon = await (await b.newContext()).request.get(url);
  assert(anon.status() === 200, 'Outlook/Google lo leen sin entrar');
  await p.click('[data-testid=calendar-rotate]');
  const url2 = await p.inputValue('[data-testid=calendar-url]');
  assert(url2 !== url && (await p.request.get(url)).status() === 404, 'cambiar el enlace: el anterior ya no vale');
  await p.click('[data-testid=calendar-drop]');
  assert(await p.isVisible('[data-testid=calendar-connect]') && (await p.request.get(url2)).status() === 404, 'desconectar');
  assert((await p.request.get(`${BASE}/cal/zz.ics`)).status() === 404, 'enlace inventado: 404');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
