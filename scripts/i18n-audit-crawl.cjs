// Auditoría de idiomas (docs/I18N.md): recorre la consola en un idioma y saca las líneas visibles que parecen español,
// para revisar a mano (el contenido del espacio sale en su idioma; la interfaz no debería).
//   npm run build && npm run start:demo ; LANG_CODE=ko node scripts/i18n-audit-crawl.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const LANG = process.env.LANG_CODE || 'ko';
const WHO = process.env.WHO || 'admin@enjoy.test';
const ES = /[ñ¿¡]|[áéíóú]|\b(de|para|con|los|las|una|tu|tus|sin|del|que|esta|este|aquí|cuando|desde|todavía|propuesta|cliente)\b/i;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: LANG });
  await ctx.addCookies([{ name: 'ss_locale', value: LANG, url: BASE }]);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click(`[data-testid="demo-${WHO}"]`);
  await p.waitForURL(/\/admin/);
  const seen = new Set(); const queue = ['/admin', '/admin/start', '/admin/inicio', '/admin/learn', '/admin/learn/tour', '/admin/accounts', '/admin/compose', '/admin/wins', '/admin/analytics', '/admin/commissions', '/admin/commissions/team', '/admin/notifications', '/admin/account', '/admin/playbook', '/admin/catalog', '/admin/team', '/admin/team/org', '/admin/territory', '/admin/prices', '/admin/brand', '/admin/setup', '/admin/setup/ia', '/admin/welcome', '/admin/platform', '/admin/dossiers'];
  const out = new Map();
  while (queue.length && seen.size < 70) {
    const path = queue.shift(); if (seen.has(path)) continue; seen.add(path);
    try { await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 }); } catch { continue; }
    // Solo la interfaz: fuera lo que es contenido del espacio (jugadas, sectores, textos de módulos, propuestas).
    const lines = await p.evaluate(() => {
      const skip = (el) => el.closest('[data-content], .prose, [data-testid=play], [data-module], iframe, .thumb, [data-block-type]');
      const res = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { const t = n.textContent.trim(); const el = n.parentElement; if (!t || !el || skip(el)) continue; const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') continue; res.push(t); }
      document.querySelectorAll('[placeholder],[aria-label],[title]').forEach((e) => { for (const a of ['placeholder', 'aria-label', 'title']) { const v = e.getAttribute(a); if (v) res.push(`[${a}] ${v}`); } });
      return res;
    });
    for (const l of lines) if (ES.test(l) && !/[가-힣]/.test(l)) { if (!out.has(l)) out.set(l, path); }
    const links = await p.$$eval('a[href^="/admin"]', (as) => as.map((a) => a.getAttribute('href')));
    for (const h of links) { const u = h.split('#')[0]; if (!seen.has(u) && !/logout|preview|\/api\/|export|download/.test(u) && queue.length < 200) queue.push(u); }
  }
  for (const [l, path] of out) console.log(`${path} :: ${l.slice(0, 140)}`);
  console.error(`páginas: ${seen.size}, líneas: ${out.size}`);
  await b.close();
})();
