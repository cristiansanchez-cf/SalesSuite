/**
 * Smoke de los decks de inversión (docs/DECKS.md), en demo: Enjoy tiene la sección activada. El admin crea un deck para
 * un inversor nuevo (se da de alta en el CRM como «Inversor»), el deck nace con los bloques de inversión y sin lo de
 * vender (sector, precio, resultado), se publica y se abre su enlace; sale en Decks y en su analítica, no en Propuestas.
 * En la ficha del inversor, «Crear deck» y sus decks. El superadmin quita la sección y el menú desaparece.
 *   npm run build && npm run start:demo ; node scripts/smoke-decks.cjs   (deja la demo cambiada)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const login = async (email) => {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
    p.on('dialog', (d) => d.accept());
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const p = await login('admin@enjoy.test');
  await p.goto(`${BASE}/admin/inicio`);
  assert(await p.isVisible('[data-testid=nav-decks]'), 'Enjoy: «Decks» en el menú');

  await p.click('[data-testid=nav-decks]');
  await p.waitForURL(/\/admin\/decks$/);
  assert(await p.isVisible('[data-testid=decks-page]'), 'la sección Decks');
  const investor = `Fondo Smoke ${RUN}`;
  await p.click('[data-testid=new-deck]');
  await p.fill('[data-testid=deck-investor]', investor);
  assert((await p.inputValue('[data-testid=deck-title]')) === `Deck para ${investor}`, 'el título se propone solo');
  await Promise.all([p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/), p.click('[data-testid=deck-create]')]);
  const deckUrl = p.url();
  await p.waitForSelector('[data-testid=share]');
  const text = await p.evaluate(() => document.querySelector('main')?.innerText ?? '');
  assert(/Portada/.test(text) && /La ronda/.test(text) && /Equipo/.test(text), 'nace con los bloques del deck (portada… ronda)');
  assert(!(await p.isVisible('[data-testid=price-panel]')) && !(await p.isVisible('[data-testid=outcome]')) && !(await p.isVisible('[data-testid=segment]')), 'sin precio, resultado ni sector');
  assert(await p.isVisible('[data-testid=crm-account]') && (await p.textContent('[data-testid=crm-account]')).includes(investor), 'vinculado al inversor del CRM');

  // Publicar y abrir el enlace (como el inversor).
  await p.click('[data-testid=publish]');
  await p.waitForSelector('[data-testid=share-url]');
  const link = (await p.textContent('[data-testid=share-url]')).trim();
  const guest = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await guest.goto(link.startsWith('http') ? link : `${BASE}${link}`);
  const pub = await guest.evaluate(() => document.body.innerText);
  assert(pub.toLowerCase().includes(`para ${investor}`.toLowerCase()) && /Lo que levantamos/i.test(pub), 'el enlace público: portada «Para <inversor>» y la ronda');
  if (OUT) await guest.screenshot({ path: `${OUT}/deck-public.png` });
  await guest.close();

  // Decks y su analítica sí; Propuestas no.
  await p.goto(`${BASE}/admin/decks`);
  assert(await p.isVisible(`[data-testid=deck][data-status=published] >> text=${investor}`), 'sale en Decks, publicado');
  if (OUT) await p.screenshot({ path: `${OUT}/decks.png`, fullPage: true });
  await p.goto(`${BASE}/admin?autor=todos`);
  assert(!(await p.evaluate((n) => document.body.innerText.includes(n), investor)), 'no sale en Propuestas');
  await p.goto(`${BASE}/admin/decks/analitica`);
  assert(await p.isVisible('[data-testid=analytics-kpis]') && Number(await p.textContent('[data-testid=kpi-published]')) >= 1, 'analítica de decks: al menos uno publicado');
  assert(await p.isVisible('[data-testid=tab-decks-analytics]'), 'pestañas Decks · Analítica');

  // La ficha del inversor: tipo Inversor, sus decks y «Crear deck».
  await p.goto(`${BASE}/admin/accounts?ver=all&tipo=inversor&q=${encodeURIComponent(investor)}`);
  await p.click('[data-testid=account] a');
  await p.waitForSelector('[data-testid=account-dossier]');
  assert(/Crear deck/.test(await p.textContent('[data-testid=account-dossier]')), 'la ficha del inversor: «Crear deck»');
  assert(/Decks · 1/.test(await p.textContent('[data-testid=account-proposals-open]')), 'la ficha del inversor: «Decks · 1»');
  const acc = await p.evaluate(() => document.querySelector('main')?.innerText ?? '');
  assert(/inversor/i.test(acc), 'dado de alta como Inversor');
  assert(!(await p.isVisible('[data-testid=qualification]')), 'sin cualificación de venta');

  // El superadmin quita la sección: fuera del menú y la página vuelve a Propuestas.
  const sup = await login('super@cofundo.test');
  await sup.goto(`${BASE}/admin/platform`);
  const form = '[data-testid=platform-space][data-slug=enjoy] [data-testid=platform-decks]';
  assert((await sup.getAttribute(form, 'data-on')) === '1', 'Plataforma: Enjoy con Decks activada');
  await Promise.all([sup.waitForLoadState('load'), sup.click(`${form} [data-testid=platform-decks-toggle]`)]);
  assert((await sup.getAttribute(form, 'data-on')) === '0', 'Plataforma: quitada');
  await p.goto(`${BASE}/admin/inicio`);
  assert(!(await p.isVisible('[data-testid=nav-decks]')), 'sin la sección, no hay «Decks» en el menú');
  await p.goto(`${BASE}/admin/decks`);
  assert(!/\/admin\/decks/.test(p.url()), 'y /admin/decks lleva fuera');
  assert((await p.goto(deckUrl)).status() === 200, 'el deck ya hecho sigue abriéndose');
  await Promise.all([sup.waitForLoadState('load'), sup.click(`${form} [data-testid=platform-decks-toggle]`)]);
  assert((await sup.getAttribute(form, 'data-on')) === '1', 'Plataforma: activada otra vez');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
