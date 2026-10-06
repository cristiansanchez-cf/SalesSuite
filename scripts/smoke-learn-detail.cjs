/**
 * Smoke de Aprende en detalle (docs/PLAYBOOK.md §Aprender; src/pages/admin/learn/sector/**): lo que smoke-learn.cjs no
 * mira, en TODOS los sectores de Enjoy (tenants/enjoy/tenant.json → market):
 *  - «Imagínatelo» enseña las pantallas de la receta del sector (proposal: bloques de producto en su orden, con su
 *    título y, en la pantalla en vivo, sus mismas escenas); sin receta, sus módulos por prioridad. Ninguna <iframe>.
 *  - «Ideas para contarlo»: las jugadas «Cómo presentarlo» del sector, enteras.
 *  - «Qué decir»: cada tarjeta se lee sin desplegar (resumen en plano: summarize() de src/lib/playbook/markdown.ts).
 *  - Cada actor enlazado desde «Quién está en la sala» abre su ficha con lo que le importa, cómo ganártelo, etc.
 *   npm run build && npm run start:demo ; node scripts/smoke-learn-detail.cjs
 */
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const tenant = require(path.join(__dirname, '..', 'tenants', 'enjoy', 'tenant.json'));

// Lo mismo que src/lib/playbook/markdown.ts (stripMarkdown / summarize): el resumen que se espera leer en la tarjeta.
const stripMarkdown = (s) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2');
function summarize(src, max = 220) {
  const plain = stripMarkdown(src).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').split('\n')
    .map((l) => l.replace(/^\s*(?:>\s*|#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)+/, '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('» '));
  if (end >= max * 0.45) return cut.slice(0, end + 1).trim();
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:—–-]+$/, '')}…`;
}
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
// Para buscar un texto de Markdown en la página: sin marcas, solo el arranque.
const head = (s, n = 40) => norm(stripMarkdown(s ?? '').replace(/^\s*[-•]\s+/gm, '')).slice(0, n);
const generic = (s) => (typeof s === 'string' ? s.replace(/\{company\}/g, 'Tu cliente').replace(/\{prospect\}/g, '') : '');

const PRODUCT = new Set(['live-screen', 'phone-tour', 'tabs-showcase', 'media-strip']);

/**
 * El mercado de Enjoy en una forma común. Con Supabase, lo que importa el alta (tenants/enjoy/tenant.json); en DEMO, el
 * servidor arranca de supabase/seed/fixtures.json (un subconjunto: 4 sectores). Se usa el que coincide con lo que
 * lista Aprende.
 */
function fromTenant() {
  const retired = new Set(tenant.retired_plays ?? []);
  return {
    name: 'tenants/enjoy/tenant.json',
    catalog: Object.fromEntries(tenant.catalog.map((c) => [c.key, { block_type: c.block_type, name: c.name, props: c.props ?? {} }])),
    segments: tenant.market,
    plays: tenant.playbook.filter((p) => (p.status ?? 'official') === 'official' && !retired.has(p.key)),
  };
}
function fromFixtures() {
  const fx = require(path.join(__dirname, '..', 'supabase', 'seed', 'fixtures.json'));
  const T = fx.tenant.find((t) => t.slug === 'enjoy').id;
  const mods = fx.module.filter((m) => m.tenant_id === T);
  const keyOf = Object.fromEntries(mods.map((m) => [m.id, m.key]));
  const latest = (id) => fx.module_version.filter((v) => v.module_id === id && v.status === 'published').sort((a, b) => b.version - a.version)[0];
  return {
    name: 'supabase/seed/fixtures.json',
    catalog: Object.fromEntries(mods.map((m) => [m.key, { block_type: m.block_type, name: m.name, props: latest(m.id)?.default_props ?? {} }])),
    segments: fx.segment.filter((x) => x.tenant_id === T && x.status === 'official').sort((a, b) => a.position - b.position).map((sg) => ({
      ...sg,
      modules: fx.segment_module.filter((r) => r.segment_id === sg.id).map((r) => ({ module_key: keyOf[r.module_id], priority: r.priority })),
      personas: fx.persona.filter((pe) => pe.segment_id === sg.id).map((pe) => ({
        ...pe, angles: fx.persona_module.filter((r) => r.persona_id === pe.id).map((r) => ({ module_key: keyOf[r.module_id], angle: r.angle })),
      })),
    })),
    plays: fx.play.filter((p) => p.tenant_id === T && p.status === 'official'),
  };
}

/** Lo que «Imagínatelo» debe enseñar según la receta del sector (o, sin ella, sus módulos por prioridad). */
function expectedShots(sg, catalog) {
  const r = sg.proposal;
  if (r && r.blocks) {
    const keys = [...new Set([...(r.priority ?? []), ...Object.keys(r.blocks)])];
    return keys.flatMap((k) => {
      const b = r.blocks[k];
      const c = b && catalog[b.module];
      if (!c || !PRODUCT.has(c.block_type)) return [];
      const props = { ...c.props, ...(b.props ?? {}) };
      return [{ key: k, bt: c.block_type, title: generic(props.title) || c.name, scenes: props.scenes }];
    });
  }
  return [...sg.modules].sort((a, b) => a.priority - b.priority).slice(0, 3).map((m) => {
    const c = catalog[m.module_key];
    return { key: m.module_key, bt: c.block_type, title: generic(c.props?.title) || c.name, scenes: c.props?.scenes };
  });
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/learn`);
  await p.waitForSelector('[data-testid=segment]');
  const listed = await p.$$eval('[data-testid=segment]', (els) => els.map((e) => e.getAttribute('href').split('/').pop()));
  // Otros smokes pueden añadir sectores (puntos de partida, configuración con IA…): basta con que estén todos los de Enjoy.
  const same = (src) => src.segments.every((x) => listed.includes(x.key));
  const src = [fromTenant(), fromFixtures()].find(same);
  assert(!!src, `Aprende lista todos los sectores de Enjoy (${listed.join(', ')})`);
  if (!src) { await b.close(); return; }
  console.log(`nota: datos esperados de ${src.name}`);
  const extra = listed.filter((k) => !src.segments.some((x) => x.key === k));
  for (const k of extra) {
    await p.goto(`${BASE}/admin/learn/sector/${k}`, { waitUntil: 'domcontentloaded' });
    assert((await p.locator('iframe').count()) === 0, `[${k}] (sector añadido por otro smoke) ningún <iframe>`);
  }
  const { catalog, plays } = src;
  const playByTitle = new Map(plays.map((pl) => [pl.title, pl]));

  let personaPages = 0;
  for (const sg of src.segments) {
    await p.goto(`${BASE}/admin/learn/sector/${sg.key}`, { waitUntil: 'domcontentloaded' });
    const tag = `[${sg.key}]`;
    assert((await p.textContent('h1')).trim() === sg.name, `${tag} ficha del sector «${sg.name}»`);
    assert((await p.locator('iframe').count()) === 0, `${tag} ningún <iframe> en la página`);

    // ---- Imagínatelo: las pantallas de su receta, en orden
    const want = expectedShots(sg, catalog);
    const blocks = p.locator('[data-testid=imagine-block]');
    const titles = await blocks.evaluateAll((els) => els.map((e) => e.querySelector('p.text-2xl')?.textContent.trim() ?? ''));
    assert(JSON.stringify(titles) === JSON.stringify(want.map((w) => w.title)),
      `${tag} Imagínatelo = ${sg.proposal ? 'su receta' : 'sus módulos'} (${titles.length}: ${titles.join(' · ')})`);
    for (let i = 0; i < want.length && i < titles.length; i++) {
      const w = want[i];
      const blk = blocks.nth(i);
      if (w.bt === 'live-screen') {
        const cfg = JSON.parse(await blk.locator('[data-testid=imagine-ui] script[data-config]').textContent().catch(() => '{}'));
        const got = (cfg.scenes ?? []).map((s) => `${s.scene}|${s.text}`);
        const exp = (w.scenes ?? []).map((s) => `${s.scene}|${generic(s.text ?? '')}`);
        assert(got.length && JSON.stringify(got) === JSON.stringify(exp), `${tag} «${w.title}»: la pantalla con sus escenas (${got.map((x) => x.split('|')[0]).join(', ')})`);
        assert((await blk.locator('[data-testid=imagine-items] li').count()) === exp.length, `${tag} «${w.title}»: cada escena contada`);
      } else if (PRODUCT.has(w.bt)) {
        assert(await blk.locator('[data-testid=imagine-ui] > *').first().isVisible().catch(() => false), `${tag} «${w.title}»: con la UI del producto (${w.bt})`);
      }
      // Todas (también las que no son de producto, como una portada): se ven en la propuesta real.
      assert(/^\/admin\/learn\/preview\/[0-9a-f-]{36}$/.test((await blk.locator('[data-testid=imagine-preview]').getAttribute('href')) ?? ''), `${tag} «${w.title}»: enlace a verla en la propuesta`);
    }
    if (want.some((w) => w.bt === 'live-screen')) {
      await p.locator('[data-module=live-screen-mini]').first().scrollIntoViewIfNeeded();
      await p.waitForSelector('[data-module=live-screen-mini] .es-stage', { timeout: 8000 }).catch(() => {});
      assert(await p.locator('[data-module=live-screen-mini] .es-stage').first().isVisible().catch(() => false), `${tag} la pantalla en vivo arranca`);
    }

    // ---- Ideas para contarlo: las jugadas «Cómo presentarlo» del sector, enteras
    const personaKeys = new Set(sg.personas.map((x) => x.key));
    const forSeg = plays.filter((pl) => (pl.segments ?? []).includes(sg.key) || (pl.personas ?? []).some((k) => personaKeys.has(k)));
    const pitches = forSeg.filter((pl) => pl.kind === 'pitch');
    if (pitches.length) {
      const ideas = norm(await p.textContent('[data-testid=imagine-ideas]').catch(() => ''));
      const missing = pitches.filter((pl) => !ideas.includes(norm(pl.title)) || !ideas.includes(head(pl.body)));
      assert(ideas.includes('Ideas para contarlo') && !missing.length, `${tag} «Ideas para contarlo» con sus ${pitches.length} jugadas enteras${missing.length ? ` (faltan: ${missing.map((x) => x.key).join(', ')})` : ''}`);
    } else assert((await p.locator('[data-testid=imagine-ideas]').count()) === 0, `${tag} sin jugadas «Cómo presentarlo», sin «Ideas para contarlo»`);

    // ---- Qué decir: el resumen se lee sin desplegar nada
    const cards = await p.$$eval('[data-testid=sector-plays] a.co-card', (els) => els.map((e) => {
      const spans = e.querySelectorAll(':scope > span');
      const sum = spans[spans.length - 1];
      const r = sum.getBoundingClientRect();
      return { title: spans[1]?.textContent.trim(), sum: sum.textContent.trim(), shown: r.height > 0 && getComputedStyle(sum).visibility !== 'hidden', inDetails: !!e.closest('details:not([open])') };
    }));
    if (forSeg.length) {
      const bad = cards.filter((c) => {
        const pl = playByTitle.get(c.title);
        return !c.shown || c.inDetails || !c.sum || /\*\*|\n|^\s*(?:[-•#>]|\d+[.)])\s/.test(c.sum) || (pl && c.sum !== summarize(pl.body, 180));
      });
      const known = cards.filter((c) => playByTitle.has(c.title)).length;
      assert(cards.length > 0 && known > 0 && !bad.length, `${tag} «Qué decir»: ${cards.length} tarjetas con su resumen a la vista y en plano (${known} = summarize(cuerpo, 180))${bad.length ? ` (mal: ${bad.map((x) => x.title).join(' · ')})` : ''}`);
    }

    // ---- Quién está en la sala → ficha de cada actor
    const linked = await p.$$eval('[data-testid=persona]', (els) => els.map((e) => ({ key: e.dataset.personaKey, href: e.getAttribute('href') })));
    const keys = linked.map((x) => x.key);
    assert(sg.personas.every((x) => keys.includes(x.key)), `${tag} los ${sg.personas.length} actores enlazados (${keys.join(', ')})`);
    for (const { key, href } of linked) {
      const per = sg.personas.find((x) => x.key === key);
      const res = await p.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
      personaPages++;
      const t = `${tag}/${key}`;
      if (!res || res.status() !== 200 || !(await p.isVisible('[data-testid=persona-page]'))) { assert(false, `${t} la ficha del actor carga (${res && res.status()})`); continue; }
      // Un actor añadido en esta sesión (otro smoke): basta con que cargue.
      if (!per) { assert(norm(await p.textContent('h1')).length > 0, `${t} ficha del actor (añadido) carga`); continue; }
      const main = norm(await p.textContent('[data-testid=persona-page]'));
      const want2 = [
        ['nombre', per.name], ['qué quiere', per.goals], ['qué le duele', per.pains], ['cómo ganártelo', per.how_to_approach && head(per.how_to_approach)],
        ['qué evitar', per.avoid], ['cómo ayuda', per.can_help], ['cómo lo tumba', per.can_block],
        ...(per.angles ?? []).map((a) => ['ángulo', a.angle]),
        ...plays.filter((pl) => (pl.personas ?? []).includes(key)).map((pl) => ['jugada', pl.title]),
      ].filter(([, v]) => v);
      const miss = want2.filter(([, v]) => !main.includes(norm(v)));
      const h1 = norm(await p.textContent('h1'));
      assert(h1 === per.name && !miss.length && (await p.isVisible('[data-testid=compose-persona]')),
        `${t} ficha del actor: ${want2.length} piezas clave${miss.length ? ` (faltan: ${miss.map(([k, v]) => `${k} «${String(v).slice(0, 30)}»`).join(' · ')})` : ''}`);
      if (per.how_to_approach) assert(await p.isVisible('[data-testid=persona-approach]'), `${t} «Cómo ganártelo» a la vista`);
      assert((await p.getAttribute('[data-testid=persona-back]', 'href')) === `/admin/learn/sector/${sg.key}`, `${t} vuelve a su sector`);
    }
  }
  assert(personaPages >= src.segments.reduce((n, s) => n + s.personas.length, 0), `${personaPages} fichas de actor abiertas`);
  const r404 = await p.goto(`${BASE}/admin/learn/sector/${src.segments[0].key}/no-existe-${Date.now().toString(36)}`);
  assert(r404.status() === 404, 'un actor que no existe → 404');
  assert(errors.length === 0, `sin errores JS (${errors.slice(0, 3).join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
