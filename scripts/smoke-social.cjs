/**
 * Smoke de «Traer de sus redes» (docs/PERSONALIZE.md §Traer de sus redes), en demo y a tamaño de móvil: propuesta para
 * Club Sol (con Instagram en el CRM) → «De su Instagram» → sus publicaciones con lo propuesto marcado → elegir →
 * añadir → las fotos y el vídeo quedan en la propuesta; lo que no se puede traer se explica.
 *   npm run build && npm run start:demo ; node scripts/smoke-social.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin`);
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=prospectCompany]', 'Club Sol');
  await p.fill('[data-testid=create-form] [name=title]', 'Propuesta para Club Sol (redes)');
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  const url = p.url();
  await p.waitForSelector('[data-testid=personalize]');
  assert(!(await p.isVisible('[data-testid=social-photos-instagram]')), 'sin empresa vinculada no sale');
  // Vincularla a Club Sol (tiene su Instagram en el CRM).
  await p.selectOption('#link-account', { label: 'Club Sol' });
  await Promise.all([p.waitForURL(url), p.click('[data-testid=crm-account] button[type=submit]')]);
  await p.waitForSelector('[data-testid=social-photos-instagram]');
  assert(true, '«De su Instagram» junto a las fotos');

  await p.click('[data-testid=social-photos-instagram]');
  await p.waitForSelector('[data-testid=social-post]');
  const posts = await p.$$eval('[data-testid=social-post]', (xs) => xs.map((x) => `${x.getAttribute('data-type')}:${x.getAttribute('data-on')}`));
  assert(posts.length === 6, `sus publicaciones (${posts.length})`);
  // Propuestas: la fijada y las que más gustan (4 fotos) y el vídeo fijado.
  const on = posts.filter((x) => x.endsWith(':1'));
  assert(on.filter((x) => !x.startsWith('video')).length === 4 && on.filter((x) => x.startsWith('video')).length === 1, `lo propuesto: ${on.join(', ')}`);
  if (OUT) await p.screenshot({ path: `${OUT}/social-sheet.png` });
  // La de «no disponible» (la 4.ª) se quita y se elige el otro vídeo.
  const items = p.locator('[data-testid=social-post]');
  const pick = (n) => items.nth(n).locator('[data-testid=social-pick]').click();
  // Ver de cerca antes de elegir: tocar la publicación la abre en grande (no la elige).
  await items.nth(0).locator('[data-testid=social-peek-open]').click();
  await p.waitForSelector('[data-testid=social-peek]');
  assert((await items.nth(0).getAttribute('data-on')) === '1', 'tocar la publicación la abre de cerca sin cambiar la elección');
  assert(await p.isVisible('[data-testid=social-peek-caption]') && (await p.getAttribute('[data-testid=social-peek-original]', 'href')).startsWith('https://'), 'de cerca: su texto y el enlace a la original');
  assert(await p.isVisible('[data-testid=social-add]'), 'y se puede añadir sin salir');
  await p.click('[data-testid=social-peek-next]');
  assert((await p.getAttribute('[data-testid=social-peek]', 'data-i')) === '1', 'siguiente');
  if (OUT) await p.screenshot({ path: `${OUT}/social-peek.png` });
  // Un vídeo se reproduce aquí con el reproductor oficial de la red (sin descargarlo), al pulsar ▶.
  await p.click('[data-testid=social-peek-play]');
  const embed = await p.getAttribute('[data-testid=social-peek-embed]', 'src');
  assert(/^https:\/\/www\.instagram\.com\/p\/[\w-]+\/embed$/.test(embed ?? ''), `▶ carga el reproductor de Instagram (${embed})`);
  await p.click('[data-testid=social-peek-pick]'); // el vídeo 2: cambia el elegido
  assert((await items.nth(1).getAttribute('data-on')) === '1' && (await items.nth(4).getAttribute('data-on')) === '0', 'elegir desde la vista de cerca (un solo vídeo: cambia el elegido)');
  await p.keyboard.press('Escape');
  assert(!(await p.isVisible('[data-testid=social-peek]')) && await p.isVisible('[data-testid=social-sheet]'), 'Esc vuelve a todas');
  await pick(3);
  assert((await items.nth(3).getAttribute('data-on')) === '0', 'desmarcar con el círculo');
  await pick(4);
  assert((await items.nth(4).getAttribute('data-on')) === '1' && (await items.nth(1).getAttribute('data-on')) === '0', 'un solo vídeo: elegir otro cambia el elegido');
  await pick(1);
  await pick(3); // vuelve a marcarla para ver el aviso
  // Ya no hay pausa entre descargas (API oficial): se frena cada «traer» para poder ver la barra y el segundo plano.
  const slow = async (route) => {
    const body = route.request().postData() ?? '';
    if (body.includes('"step":"import"')) await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  };
  await p.route('**/social', slow);
  await p.click('[data-testid=social-add]');
  await p.waitForSelector('[data-testid=social-progress] [role=progressbar]');
  assert(true, 'barra de progreso');
  if (OUT) await p.screenshot({ path: `${OUT}/social-progress.png` });
  // Se deja correr en segundo plano: la tarjeta enseña el progreso y, al acabar, el resumen.
  await p.click('[data-testid=social-close]');
  await p.waitForSelector('[data-testid=social-bg] [role=progressbar]');
  assert(!(await p.isVisible('[data-testid=social-sheet]')), 'en segundo plano, con la barra en la tarjeta');
  await p.waitForSelector('[data-testid=social-notice]', { timeout: 90_000 });
  await p.unroute('**/social', slow);
  const report = await p.textContent('[data-testid=social-notice]');
  assert(/Añadidas 4/.test(report) && /no se puede usar/.test(report), `resumen: ${report.replace(/\s+/g, ' ')}`);
  const photos = await p.$$eval('[data-testid=media-photos] img', (xs) => xs.length);
  assert(photos === 3, `fotos en la propuesta (${photos})`);
  // Una que no sale en las 12 últimas: se pega su enlace.
  await p.click('[data-testid=social-photos-instagram]');
  await p.waitForSelector('[data-testid=social-link]');
  await p.fill('[data-testid=social-link]', 'https://www.instagram.com/p/ANTIGUA123/?igsh=x');
  await p.click('[data-testid=social-link-add]');
  await p.waitForSelector('[data-testid=social-sheet]', { state: 'detached', timeout: 60_000 });
  const more = await p.$$eval('[data-testid=media-photos] img', (xs) => xs.length);
  assert(more === 4, `pegando el enlace de una publicación antigua (${more} fotos)`);
  assert(await p.isVisible('[data-testid=media-video] video'), 'vídeo en la propuesta');
  assert(!(await p.isVisible('[data-testid=social-video-instagram]')), 'con vídeo ya puesto no se ofrece otro');
  if (OUT) await p.screenshot({ path: `${OUT}/social-done.png`, fullPage: true });
  // Instagram (API oficial de Meta, cuenta de empresa) y TikTok: página a página.
  await p.click('[data-testid=social-photos-instagram]');
  await p.waitForSelector('[data-testid=social-post]');
  const igBefore = await p.locator('[data-testid=social-post]').count();
  await p.click('[data-testid=social-more]');
  await p.waitForFunction((n) => document.querySelectorAll('[data-testid=social-post]').length > n, igBefore);
  assert((await p.locator('[data-testid=social-post]').count()) === igBefore + 6, 'Instagram: «Cargar más» trae la página siguiente');
  await p.click('[data-testid=social-close]');
  await p.click('[data-testid=social-photos-tiktok]');
  await p.waitForSelector('[data-testid=social-post]');
  const n1 = await p.locator('[data-testid=social-post]').count();
  await p.click('[data-testid=social-more]');
  await p.waitForFunction((n) => document.querySelectorAll('[data-testid=social-post]').length > n, n1);
  const n2 = await p.locator('[data-testid=social-post]').count();
  assert(n1 === 6 && n2 === 12, `TikTok: «Cargar más» añade la página siguiente (${n1} → ${n2})`);
  // Hasta el final: la última página llena trae cursor y la siguiente sale vacía; entonces desaparece el botón.
  for (let i = 0; i < 4 && (await p.isVisible('[data-testid=social-more]')); i++) {
    await p.click('[data-testid=social-more]');
    await p.waitForFunction(() => !document.querySelector('[data-testid=social-more]')?.hasAttribute('disabled'));
  }
  assert(!(await p.isVisible('[data-testid=social-more]')) && (await p.locator('[data-testid=social-post]').count()) === 18, 'sin más páginas, sin botón');
  if (OUT) await p.screenshot({ path: `${OUT}/social-more.png` });
  await p.click('[data-testid=social-close]');
  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})();
