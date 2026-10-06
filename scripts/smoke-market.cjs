/**
 * Smoke E2E del mapa de mercado (modo DEMO): sectores y actores, Preparar mensaje (contexto para el Cerebro),
 * cuenta del dossier (actores y postura), guion «Con quién hablas» y seguimiento.
 *   npm run build && npm run start:demo ; node scripts/smoke-market.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const login = async (email) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(`${BASE}/admin`);
    return p;
  };
  const settle = (p) => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));

  const rep = await login('rep@enjoy.test');
  // ---- sectores y actores
  await rep.goto(`${BASE}/admin/learn`);
  // El cuerpo de Aprende llega en un segundo bloque (server island): se espera a que estén los sectores.
  await rep.waitForSelector('[data-testid=segment]');
  // Otros smokes pueden haber añadido sectores (punto de partida «buceo»): basta con que estén los 4 de Enjoy.
  const segs = await rep.$$eval('[data-testid=segment]', (els) => els.map((e) => e.textContent));
  assert(['Bodas', 'Locales de ocio nocturno', 'Conciertos', 'Festivales'].every((n) => segs.some((t) => t.includes(n))), 'Aprende: los 4 sectores de Enjoy');
  await rep.locator('[data-testid=segment]', { hasText: 'ocio nocturno' }).click();
  assert((await rep.textContent('[data-testid=segment-modules]')).includes('Experiencias en directo'), 'módulos que encajan en el sector');
  assert((await rep.locator('[data-testid=sector-room] .text-eyebrow').allTextContents()).some((t) => /Deciden/.test(t)), 'mapa de la sala: quién decide');
  if (OUT) await rep.screenshot({ path: `${OUT}/sector.png`, fullPage: true });
  // Cada persona tiene su pantalla (el detalle no se amontona en la ficha del sector).
  await rep.click('[data-testid=persona][data-persona-key=dj-residente]');
  await rep.waitForURL(/\/admin\/learn\/sector\/ocio-nocturno\/dj-residente/);
  assert((await rep.textContent('[data-testid=persona-page]')).includes('Cómo puede tumbarlo'), 'actor con «puede ayudar / puede tumbarlo»');
  if (OUT) await rep.screenshot({ path: `${OUT}/persona.png`, fullPage: true });

  // ---- preparar mensaje: «tipo DJ»
  await rep.click('[data-testid=compose-persona]');
  await rep.waitForSelector('[data-testid=brief]');
  assert((await rep.inputValue('[data-testid=prompt]')).includes('SECTOR: Locales de ocio nocturno'), 'contexto del sector y del actor sin escribir nada');
  await rep.selectOption('[data-testid=type-select]', 'objecion');
  await rep.click('[data-testid=compose-go]');
  assert((await rep.textContent('[role=alert]')).includes('objeción'), 'objeción obligatoria para responder a una objeción');
  await rep.selectOption('[name=objection]', 'desconfianza');
  await rep.click('[data-testid=compose-go]');
  const prompt = await rep.inputValue('[data-testid=prompt]');
  assert(prompt.includes('buscar_tecnica') && prompt.includes('objeción: «Desconfianza»'), 'petición para el Cerebro con etapa y objeción');
  assert(prompt.includes('DJ residente: "Esto me corta la sesión"'), 'incluye la jugada dirigida a ese actor');
  assert((await rep.getAttribute('[data-testid=open-claude]', 'href')).startsWith('https://claude.ai/new?q='), 'botón «Abrir en Claude» con el contexto');
  if (OUT) await rep.screenshot({ path: `${OUT}/compose.png`, fullPage: false });

  // ---- cuenta del dossier
  await rep.goto(`${BASE}/admin`);
  await rep.click('[data-testid=new-dossier]');
  await rep.fill('[data-testid=create-form] [name=title]', `Club Noche ${RUN}`);
  await rep.fill('[data-testid=create-form] [name=prospectCompany]', 'Club Noche');
  await rep.click('[data-testid=create-form] button[type=submit]');
  await rep.waitForURL(/\/admin\/dossiers\//);
  const dossierUrl = rep.url();
  await rep.click('[data-testid=add-tabs-experiencias]'); await settle(rep);
  await rep.selectOption('[data-testid=segment]', { label: 'Locales de ocio nocturno' }); await settle(rep);
  await rep.fill('[data-testid=contact-name]', 'Álex');
  await rep.selectOption('[data-testid=contact-persona]', { label: 'DJ residente (puede vetar)' });
  await rep.selectOption('[data-testid=account] select[aria-label=Postura]', 'bloqueador');
  await rep.click('[data-testid=add-contact]'); await settle(rep);
  assert((await rep.textContent('[data-testid=contacts]')).includes('Álex'), 'contacto añadido a la cuenta');

  // ---- seguimiento (vencido: ayer)
  const y = new Date(Date.now() - 86_400_000); y.setMinutes(y.getMinutes() - y.getTimezoneOffset());
  await rep.fill('[data-testid=next-step]', 'Demo con Álex antes de la sesión');
  await rep.locator('[data-testid=next-step]').press('Tab'); await settle(rep);
  await rep.fill('[data-testid=next-at]', y.toISOString().slice(0, 16));
  await rep.locator('[data-testid=next-at]').press('Tab'); await settle(rep);
  assert((await rep.textContent('[data-testid=followup]')).includes('Vencido'), 'seguimiento vencido señalado en el dossier');

  // ---- guion: con quién hablas
  await rep.click('[data-testid=tab-script]');
  await rep.waitForSelector('[data-testid=account-block]');
  const block = await rep.textContent('[data-testid=account-block]');
  assert(block.includes('Riesgo') && block.includes('sabotea'), 'guion: riesgo del bloqueador y cómo abordarle');
  if (OUT) await rep.screenshot({ path: `${OUT}/builder-account.png`, fullPage: false });

  // ---- mensaje para un contacto real de la cuenta
  await rep.locator('[data-testid=contact] a', { hasText: 'Mensaje' }).click();
  await rep.waitForSelector('[data-testid=brief]');
  const p2 = await rep.inputValue('[data-testid=prompt]');
  assert(p2.includes('DESTINATARIO: Álex (DJ residente)') && p2.includes('Postura actual: Bloqueador') && p2.includes('PROPUESTA: «Club Noche'), 'contexto con la cuenta, la postura y la propuesta');

  // ---- listado: seguimientos
  await rep.goto(`${BASE}/admin`);
  assert(await rep.isVisible('[data-testid=overdue-banner]'), 'aviso de seguimientos vencidos en el listado');
  await rep.click('[data-testid=filter-follow]');
  assert((await rep.textContent('[data-testid=dossier-list]')).includes(`Club Noche ${RUN}`), 'filtro de seguimientos');

  // ---- líder: editar el mapa
  const adm = await login('admin@enjoy.test');
  await adm.goto(`${BASE}/admin/playbook?tab=market`);
  assert((await adm.textContent('[data-testid=market-admin]')).includes('Festivales'), 'líder: pestaña Mercado');
  await adm.locator('[data-testid=market-admin] a', { hasText: 'DJ residente' }).click();
  await adm.fill('[data-testid=persona-form] [name=kpis]', `Pista llena ${RUN}`);
  await adm.click('[data-testid=persona-form] button[type=submit]');
  await adm.waitForURL(/ok=1/);
  await rep.goto(`${BASE}/admin/learn/sector/ocio-nocturno/dj-residente`);
  assert((await rep.textContent('[data-testid=persona-page]')).includes(`Pista llena ${RUN}`), 'cambio del líder visible para el equipo');
  assert((await rep.goto(`${BASE}/admin/playbook/segment/new`)).status() === 403, 'comercial no edita el mapa');

  assert(errors.length === 0, `sin errores JS ${errors}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
