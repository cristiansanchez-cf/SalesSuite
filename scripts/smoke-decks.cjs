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
  // En el móvil, siempre hacia abajo: sin diapositivas ni botón de «presentación» (también con ?ver=slides).
  const phone = await (await b.newContext({ ...require(process.env.PLAYWRIGHT_MODULE || 'playwright').devices['iPhone 13'] })).newPage();
  await phone.goto(`${link.startsWith('http') ? link : `${BASE}${link}`}?ver=slides`);
  assert((await phone.locator('.deck__slide').count()) === 0 && !(await phone.isVisible('[data-testid=layout-slides]')), 'móvil: todo hacia abajo, sin presentación');
  assert(/Lo que levantamos/i.test(await phone.evaluate(() => document.body.innerText)), 'móvil: el contenido entero');
  await phone.close();

  // Decks y su analítica sí; Propuestas no.
  await p.goto(`${BASE}/admin/decks`);
  assert(await p.isVisible(`[data-testid=deck][data-status=published] >> text=${investor}`), 'sale en Decks, publicado');
  if (OUT) await p.screenshot({ path: `${OUT}/decks.png`, fullPage: true });
  await p.goto(`${BASE}/admin?autor=todos`);
  assert(!(await p.evaluate((n) => document.body.innerText.includes(n), investor)), 'no sale en Propuestas');
  await p.goto(`${BASE}/admin/decks/analitica`);
  assert(await p.isVisible('[data-testid=analytics-kpis]') && Number(await p.textContent('[data-testid=kpi-published]')) >= 1, 'analítica de decks: al menos uno publicado');
  assert(await p.isVisible('[data-testid=tab-decks-analytics]'), 'pestañas Decks · Analítica');

  // Por MCP (la IA de la persona): ver los decks, editar un bloque entero y que lo que no vale se explique.
  {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    await p.goto(`${BASE}/admin/ia?ia=key`);
    await p.fill('[data-testid=mcp-name]', 'Decks smoke');
    await Promise.all([p.waitForLoadState('load'), p.click('[data-testid=mcp-create]')]);
    const key = await p.inputValue('[data-testid=mcp-key]');
    const client = new Client({ name: 'smoke-decks', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
    const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); const t = r.content?.[0]?.text ?? ''; return r.isError ? { error: t } : JSON.parse(t); };
    const list = await call('decks');
    const mine = list.find((d) => d.inversor === investor);
    assert(!!mine, 'MCP: decks lista el deck');
    const d = await call('deck_ver', { deck_id: mine.id });
    const cover = d.bloques.find((x) => x.clave === 'deck-portada');
    assert(cover && d.se_pueden_anadir.some((x) => x.clave === 'deck-casos'), 'MCP: deck_ver con sus bloques y lo que se puede añadir');
    const e1 = await call('deck_bloque', { deck_id: mine.id, accion: 'editar', bloque_id: cover.bloque_id, props: { title: 'Documento de *inversión.*', tagline: 'Para quienes ya conocen el proyecto.' } });
    const c2 = e1.bloques.find((x) => x.clave === 'deck-portada');
    assert(c2.props.title === 'Documento de *inversión.*' && !('round' in c2.props), 'MCP: editar deja el bloque entero (lo del catálogo que no se manda, fuera)');
    const bad = await call('deck_bloque', { deck_id: mine.id, accion: 'editar', bloque_id: cover.bloque_id, props: { tagline: 'sin título' } });
    assert(bad.error && /title/.test(bad.error), `MCP: lo que no vale se explica (${(bad.error ?? '').slice(0, 80)})`);
    const add = await call('deck_bloque', { deck_id: mine.id, accion: 'anadir', clave: 'deck-casos', posicion: 1 });
    assert(add.bloques[1]?.clave === 'deck-casos', 'MCP: añadir un bloque en su sitio');
    await client.close();
  }

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
