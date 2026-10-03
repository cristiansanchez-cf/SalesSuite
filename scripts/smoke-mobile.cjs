/**
 * Smoke de la consola en el móvil (390×844): ninguna pantalla desborda en horizontal (docs/UX_REVIEW.md #1).
 *   npm run build && npm run start:demo ; node scripts/smoke-mobile.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

const PAGES = {
  'admin@enjoy.test': ['/admin', '/admin/wins', '/admin/compose', '/admin/playbook', '/admin/playbook?tab=market', '/admin/team', '/admin/catalog', '/admin/setup', '/admin/setup?step=3', '/admin/brand', '/admin/accounts', '/admin/territory', '/admin/notifications', '/admin/commissions', '/admin/commissions/team', '/admin/commissions/team?tab=plan', '/admin/commissions/team?tab=api', '/admin/commissions/team?tab=cupones', '/admin/inicio', '/admin/analytics', '/admin/start', '/admin/dossiers/00000000-0000-4000-8000-000000d05501/analytics'],
  'rep@enjoy.test': ['/admin', '/admin/wins', '/admin/compose', '/admin/learn', '/admin/accounts', '/admin/accounts/00000000-0000-4000-8000-0000000ac001', '/admin/inicio', '/admin/analytics', '/admin/start', '/admin/learn/sector/bodas', '/admin/learn/sector/bodas/novios'],
  'dj@enjoy.test': ['/admin'],
};

(async () => {
  const b = await chromium.launch();
  for (const [user, pages] of Object.entries(PAGES)) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="${user}"], [data-testid="demo-${user}"]`);
    await p.waitForURL(/\/admin/);
    const urls = [...pages];
    // El builder también: el primer dossier de la lista.
    const first = await p.getAttribute('a[href^="/admin/dossiers/"]', 'href').catch(() => null);
    if (first) urls.push(first.split('?')[0]);
    for (const u of urls) {
      const res = await p.goto(`${BASE}${u}`);
      if (!res || res.status() >= 400) { assert(false, `${user} ${u} carga (${res && res.status()})`); continue; }
      await p.waitForTimeout(150);
      const m = await p.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const worst = [...document.querySelectorAll('body *')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && !el.closest('[data-scroll-x]'); })
          .map((el) => `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ''}.${[...el.classList].slice(0, 3).join('.')} → ${Math.round(el.getBoundingClientRect().right)}`)
          .slice(0, 4);
        return { sw: document.documentElement.scrollWidth, w, worst };
      });
      assert(m.sw <= m.w, `${user} ${u} cabe en ${m.w}px${m.sw > m.w ? ` (mide ${m.sw}: ${m.worst.join(' | ')})` : ''}`);
      if (/^\/admin\/dossiers\/[0-9a-f-]{36}$/.test(u)) {
        for (const pane of ['Vista previa', 'Guion']) {
          await p.locator('[role=tab]:visible', { hasText: pane }).first().click();
          await p.waitForTimeout(200);
          const sw = await p.evaluate(() => document.documentElement.scrollWidth);
          assert(sw <= m.w, `${user} builder · ${pane} cabe en ${m.w}px${sw > m.w ? ` (mide ${sw})` : ''}`);
        }
      }
    }
    await ctx.close();
  }
  await b.close();
})();
