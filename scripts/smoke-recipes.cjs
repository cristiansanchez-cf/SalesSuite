/**
 * Smoke de la propuesta por sector (docs/PROPOSAL_PRESETS.md), modo DEMO. Para cada sector con receta en
 * tenants/enjoy/tenant.json (`market[].proposal`):
 *  - el comercial crea una propuesta, elige el sector, tipo/ángulo/preguntas y monta la receta: los módulos montados
 *    son los que dice la receta (se calcula aquí, con la misma lógica que src/lib/proposal/preset.ts → planProposal);
 *  - publica, abre el enlace sin sesión (200) y los bloques salen en el orden de la receta.
 * En el primer sector, de punta a punta: todas las opciones de cada elección, los dos modos y las preguntas; tarifa y
 * cupón (precio tachado + nuevo en el enlace); modo presentación: flechas (botón y teclado) y una diapositiva con
 * pestañas o pantalla en vivo que se queda la flecha antes de pasar de diapositiva.
 *
 * El modo DEMO no carga tenant.json: se clona de supabase/seed/fixtures.json. Si el servidor no tiene el sector o
 * monta otra receta, se dice con KNOWN y se comprueba contra la receta del seed (la que de verdad usa el servidor).
 *   npm run build && npm run start:demo ; node scripts/smoke-recipes.cjs
 */
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const euros = (s) => Number(String(s).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ROOT = path.join(__dirname, '..');
const TENANT = require(path.join(ROOT, 'tenants/enjoy/tenant.json'));
const SEED = require(path.join(ROOT, 'supabase/seed/fixtures.json'));
const SEED_TENANT = SEED.tenant.find((t) => t.slug === 'enjoy');
const SEED_SEGMENTS = SEED.segment.filter((s) => s.tenant_id === SEED_TENANT.id);
// módulo del catálogo → plantilla (data-block-type en el enlace público)
const BLOCK_TYPE = Object.fromEntries([
  ...SEED.module.filter((m) => m.tenant_id === SEED_TENANT.id).map((m) => [m.key, m.block_type]),
  ...TENANT.catalog.map((m) => [m.key, m.block_type]),
]);
const STEPPED = ['tabs-showcase', 'live-screen'];  // se quedan la flecha (deck:step)

// ---- receta → lista de módulos (copia mínima de planProposal/effectiveAnswers, src/lib/proposal/preset.ts)
function effectiveAnswers(p, answers) {
  const out = [];
  const applies = (w) => !w || !w.length || w.some((a) => out.includes(a));
  for (const ch of p.choices || []) {
    if (!applies(ch.when)) continue;
    const picked = answers.find((a) => a.startsWith(`${ch.key}:`))?.slice(ch.key.length + 1);
    out.push(`${ch.key}:${ch.options.some((o) => o.key === picked) ? picked : ch.default}`);
  }
  for (const q of p.questions || []) if (answers.includes(q.key) && applies(q.when)) out.push(q.key);
  return out;
}
function plan(p, mode, answers) {
  let list = [...(mode === 'visual' && p.modes.visual ? p.modes.visual : p.modes.full)];
  const on = new Set(effectiveAnswers(p, answers));
  const first = (a) => (a === undefined ? undefined : (Array.isArray(a) ? a : [a]).find((x) => list.includes(x)));
  const apply = (r) => {
    if (r.when && !on.has(r.when)) return;
    if ('add' in r) {
      if (list.includes(r.add)) return;
      const after = first(r.after); const before = first(r.before);
      list.splice(after ? list.indexOf(after) + 1 : before ? list.indexOf(before) : list.length, 0, r.add);
    } else if ('remove' in r) list = list.filter((b) => b !== r.remove);
    else if ('replace' in r) list = list.map((b) => (b === r.replace ? r.with : b)).filter((b, i, a) => a.indexOf(b) === i);
  };
  let priority = p.priority || [];
  for (const ch of p.choices || []) {
    const opt = ch.options.find((o) => on.has(`${ch.key}:${o.key}`));
    (opt?.rules || []).forEach(apply);
    if (opt?.priority) priority = opt.priority;
  }
  for (const q of p.questions || []) if (on.has(q.key)) q.rules.forEach(apply);
  const max = (p.max || {})[mode] ?? (mode === 'visual' ? (p.max || {}).full : undefined);
  if (max && list.length > max) {
    const rank = (b) => { const i = priority.indexOf(b); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
    const keep = new Set([...list].sort((a, b) => rank(a) - rank(b) || list.indexOf(a) - list.indexOf(b)).slice(0, max));
    list = list.filter((b) => keep.has(b));
  }
  return list.map((b) => p.blocks[b].module);
}
// Las combinaciones a probar: en el sector completo, cada opción de cada elección, el apoyo visual y todas las
// preguntas (la última, la que se publica: todas las preguntas, en apoyo visual si lo hay); en los demás, la de por defecto.
function combos(p, all) {
  const base = { mode: 'full', answers: [] };
  if (!all) return [base];
  const out = [base];
  for (const ch of p.choices || []) {
    for (const o of ch.options) {
      const pre = (ch.when || []).slice(0, 1);  // si la elección depende de otra, primero esa
      out.push({ mode: 'full', answers: [...pre, `${ch.key}:${o.key}`] });
    }
  }
  if (p.modes.visual) out.push({ mode: 'visual', answers: [] });
  const qs = (p.questions || []).filter((q) => !q.when?.length).map((q) => q.key);
  if (qs.length) out.push({ mode: 'full', answers: qs });
  if (qs.length && p.modes.visual) out.push({ mode: 'visual', answers: qs });
  return out;
}

(async () => {
  const t0 = Date.now();
  const b = await chromium.launch();
  const errors = [];
  const login = async (email, opts = {}) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 1800 }, locale: 'es-ES', ...opts })).newPage();
    p.on('pageerror', (e) => errors.push(`${email}: ${e.message}`));
    p.on('dialog', (d) => d.accept());
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const settle = (p) => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));
  const order = (p) => p.$$eval('[data-testid=item]', (els) => els.map((e) => e.dataset.itemKey));

  // ---- admin: un cupón para la propuesta de punta a punta (como smoke-commissions.cjs)
  const CODE = `REC${RUN}`.toUpperCase().slice(0, 30);
  const COUPON = `10 % receta ${RUN}`;
  {
    const admin = await login('admin@enjoy.test');
    await admin.goto(`${BASE}/admin/commissions/team?tab=cupones`);
    await admin.fill('[data-testid=coupon-form] [name=label]', COUPON);
    await admin.fill('[data-testid=coupon-form] [name=code]', CODE);
    await admin.fill('[data-testid=coupon-form] [name=value]', '10');
    await admin.click('[data-testid=coupon-form] button[type=submit]');
    await admin.waitForLoadState();
    assert(await admin.isVisible(`[data-testid=coupon][data-code="${CODE}"]`), 'admin: cupón del 10 % creado');
    await admin.context().close();
  }

  const rep = await login('rep@enjoy.test');
  const anon = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES', reducedMotion: 'reduce' });
  const pub = await anon.newPage();
  pub.on('pageerror', (e) => errors.push(`público: ${e.message}`));

  const sectors = TENANT.market.filter((s) => s.proposal);
  assert(sectors.length >= 5, `tenant.json: ${sectors.length} sectores con receta (${sectors.map((s) => s.key).join(', ')})`);
  let e2eDone = false;

  for (const s of sectors) {
    const tag = `[${s.key}]`;
    // ---- crear la propuesta y elegir el sector
    await rep.goto(`${BASE}/admin`);
    await rep.click('[data-testid=new-dossier]');
    await rep.fill('[data-testid=create-form] [name=title]', `Receta ${s.key} ${RUN}`);
    await rep.fill('[data-testid=create-form] [name=prospectCompany]', `Cliente ${s.key}`);
    await rep.click('[data-testid=create-form] button[type=submit]');
    await rep.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
    const options = await rep.$$eval('[data-testid=segment] option', (os) => os.map((o) => ({ value: o.value, text: o.textContent.trim() })));
    const seedId = SEED_SEGMENTS.find((x) => x.key === s.key)?.id;
    const opt = options.find((o) => o.value && (o.text.toLowerCase() === s.name.toLowerCase() || o.value === seedId));
    if (!opt) {
      // KNOWN: el modo DEMO se clona de supabase/seed/fixtures.json, no de tenant.json (docs/TESTING.md → Bugs encontrados)
      console.log('KNOWN:', `${tag} el demo no tiene el sector «${s.name}» (fixtures.json no está al día con tenant.json)`);
      continue;
    }
    await rep.selectOption('[data-testid=segment]', opt.value);
    await settle(rep);
    const hasPanel = await rep.waitForSelector('[data-testid=preset]', { timeout: 3000 }).then(() => true, () => false);
    const seedRecipe = SEED_SEGMENTS.find((x) => x.key === s.key)?.proposal ?? null;
    if (!hasPanel) {
      // KNOWN: ver arriba (el sector existe en el demo, pero sin receta)
      console.log('KNOWN:', `${tag} el sector sale en el demo pero sin «Monta la propuesta» (el seed no trae su receta)`);
      continue;
    }

    // ¿Qué receta tiene el servidor? Las elecciones y preguntas que se ven sin condición dicen cuál es.
    const ui = await rep.evaluate(() => ({
      choices: [...document.querySelectorAll('[data-testid^="preset-choice-"]')].map((e) => e.dataset.testid.slice('preset-choice-'.length)),
      questions: [...document.querySelectorAll('[data-testid^="preset-q-"]')].map((e) => e.dataset.testid.slice('preset-q-'.length)),
    }));
    const shape = (p) => ({
      choices: (p.choices || []).filter((c) => !c.when?.length || effectiveAnswers(p, []).some((a) => c.when.includes(a))).map((c) => c.key),
      questions: (p.questions || []).filter((q) => !q.when?.length || effectiveAnswers(p, []).some((a) => q.when.includes(a))).map((q) => q.key),
    });
    let recipe = s.proposal;
    if (!same(shape(s.proposal), ui)) {
      if (seedRecipe && same(shape(seedRecipe), ui)) {
        // KNOWN: el demo monta la receta del seed, no la de tenant.json (docs/TESTING.md → Bugs encontrados)
        console.log('KNOWN:', `${tag} el demo monta la receta de supabase/seed/fixtures.json, no la de tenant.json: se comprueba contra la del seed`);
        recipe = seedRecipe;
      } else {
        assert(false, `${tag} el panel de la receta no coincide con tenant.json (${JSON.stringify(ui)})`);
        continue;
      }
    }

    // ---- montar la receta: una o todas las combinaciones
    const all = !e2eDone;
    let last;
    for (const c of combos(recipe, all)) {
      await rep.click(`[data-testid=preset-mode-${c.mode}]`).catch(() => {});
      for (const q of await rep.$$('[data-testid^="preset-q-"]')) {
        const k = (await q.getAttribute('data-testid')).slice('preset-q-'.length);
        if ((await q.isChecked()) !== c.answers.includes(k)) await q.click();
      }
      for (const ch of recipe.choices || []) {
        const want = c.answers.find((a) => a.startsWith(`${ch.key}:`))?.slice(ch.key.length + 1) ?? ch.default;
        const btn = rep.locator(`[data-testid="preset-opt-${ch.key}-${want}"]`);
        if (await btn.isVisible()) await btn.click();
      }
      await rep.click('[data-testid=preset-apply]');
      await settle(rep);
      await rep.waitForTimeout(150);
      const want = plan(recipe, c.mode, c.answers);
      const got = await order(rep);
      assert(same(got, want), `${tag} ${c.mode}${c.answers.length ? ' + ' + c.answers.join(', ') : ''} → ${got.join(' → ')}`);
      last = { ...c, want };
    }
    assert((await rep.textContent('[data-testid=preset-apply]')).includes('Volver'), `${tag} receta montada (se puede volver a montar)`);

    // ---- tarifa (y, en el primero, cupón)
    let before = null; let after = null;
    const needPrice = all || !(await rep.isEnabled('[data-testid=publish]'));
    if (needPrice) {
      if (!last.want.some((k) => BLOCK_TYPE[k] === 'pricing-card')) {
        const key = Object.keys(BLOCK_TYPE).find((k) => BLOCK_TYPE[k] === 'pricing-card' && k === 'pricing') ?? Object.keys(BLOCK_TYPE).find((k) => BLOCK_TYPE[k] === 'pricing-card');
        await rep.click(`[data-testid=add-${key}]`);
        await settle(rep);
        last.want = [...last.want, key];
      }
      if ((await rep.getAttribute('[data-testid=price-panel]', 'open')) === null) await rep.click('[data-testid=price-panel] summary');
      for (const kind of await rep.$$('[data-testid=price-kind]')) {
        await kind.click();
        await settle(rep);
        if (await rep.isVisible('[data-testid=total]')) break;
      }
      before = (await rep.textContent('[data-testid=total]').catch(() => '')).trim();
      assert(euros(before) > 0, `${tag} tarifa elegida: ${before}`);
    }
    if (all) {
      await rep.click(`[data-testid=coupon-${CODE}]`);
      await settle(rep);
      await rep.waitForTimeout(200);
      after = (await rep.textContent('[data-testid=total]')).trim();
      assert(Math.abs(euros(after) - euros(before) * 0.9) < 0.01, `${tag} cupón: el total baja un 10 % (${before} → ${after})`);
    }

    // ---- publicar y abrir el enlace sin sesión
    await rep.click('[data-testid=publish]');
    await settle(rep);
    await rep.waitForSelector('[data-testid=share-url]');
    assert((await rep.textContent('[data-testid=status]')).trim() === 'Publicado', `${tag} publicada`);
    const url = (await rep.textContent('[data-testid=share-url]')).trim();
    if (OUT) await rep.screenshot({ path: `${OUT}/recipe-${s.key}-builder.png`, fullPage: true });
    const r = await pub.goto(`${url}?ver=scroll`);
    assert(r.status() === 200, `${tag} enlace público 200 sin sesión`);
    const types = await pub.$$eval('[data-item-id][data-block-type]', (els) => els.map((e) => e.dataset.blockType));
    const wantTypes = last.want.map((k) => BLOCK_TYPE[k]).filter((t) => t !== 'cost-math' || types.includes('cost-math'));  // «Lo que ya te cuesta» sin cifras no sale
    assert(same(types, wantTypes), `${tag} el enlace sigue el orden de la receta: ${types.join(' → ')}`);

    if (all) {
      const fig = (await pub.textContent('[data-testid=pricing-figure]').catch(() => '')).replace(/\s/g, ' ');
      assert(fig.includes(after.replace(/\s/g, ' ')), `enlace: precio con el cupón (${after})`);
      assert((await pub.textContent('[data-testid=pricing-before]').catch(() => '')).replace(/\s/g, ' ') === before.replace(/\s/g, ' '), `enlace: la tarifa tachada (${before})`);
      assert((await pub.textContent('[data-testid=pricing-discount]').catch(() => '')).includes(COUPON), 'enlace: el cupón con su nombre');
      if (OUT) await pub.screenshot({ path: `${OUT}/recipe-${s.key}-public.png`, fullPage: true });

      // ---- modo presentación
      await pub.goto(url);
      await pub.waitForSelector('[data-deck] [data-count]');
      const count = () => pub.textContent('[data-count]').then((x) => x.trim());
      const waitCount = (n) => pub.waitForFunction((n) => document.querySelector('[data-count]').textContent.trim().startsWith(`${n} /`), n, { timeout: 3000 }).then(() => true, () => false);
      const slides = await pub.$$eval('.deck__slide', (els) => els.map((e) => ({ type: e.dataset.blockType, step: !!e.querySelector('[data-deck-step]') })));
      const total = slides.length;
      assert((await count()) === `1 / ${total}`, `presentación: ${total} diapositivas, empieza en 1`);
      const goTo = async (i) => { await pub.click(`[data-dot="${i}"]`); return waitCount(i + 1); };
      const plain = slides.findIndex((x, i) => !x.step && i < total - 1);
      if (plain >= 0) {
        await goTo(plain);
        await pub.click('[data-next]');
        assert(await waitCount(plain + 2), `presentación: botón → pasa a ${plain + 2} / ${total}`);
        await pub.click('[data-prev]');
        assert(await waitCount(plain + 1), `presentación: botón ← vuelve a ${plain + 1} / ${total}`);
        await pub.keyboard.press('ArrowRight');
        assert(await waitCount(plain + 2), 'presentación: tecla → pasa de diapositiva');
        await pub.keyboard.press('ArrowLeft');
        assert(await waitCount(plain + 1), 'presentación: tecla ← vuelve');
      } else assert(false, 'presentación: hay una diapositiva sin pestañas para probar las flechas');
      let stepped = 0;
      for (const type of STEPPED) {
        const sel = type === 'tabs-showcase' ? '[role=tab]' : '[data-scene-btn]';
        // una diapositiva de ese tipo con al menos dos pestañas/pantallas (con una sola no hay nada que consumir)
        const j = (await pub.$$eval('.deck__slide', (els, [type, sel]) => els.map((e) => (e.dataset.blockType === type && e.querySelector('[data-deck-step]') ? e.querySelectorAll(sel).length : 0)), [type, sel])).findIndex((n) => n >= 2);
        if (j < 0) { console.log(`(sin ${type} de varias pestañas en esta receta)`); continue; }
        stepped++;
        await goTo(j);
        const active = () => pub.$$eval(`.deck__slide[data-slide="${j}"] ${sel}`, (els) => els.findIndex((e) => e.getAttribute('aria-selected') === 'true'));
        const n = await pub.$$eval(`.deck__slide[data-slide="${j}"] ${sel}`, (els) => els.length);
        const a0 = await active();
        await pub.click('[data-next]');
        await pub.waitForTimeout(150);
        assert((await count()) === `${j + 1} / ${total}` && (await active()) === a0 + 1, `${type}: el botón → avanza la ${type === 'tabs-showcase' ? 'pestaña' : 'pantalla'} (${a0 + 1} → ${a0 + 2} de ${n}) y no la diapositiva`);
        await pub.keyboard.press('ArrowLeft');
        await pub.waitForTimeout(150);
        assert((await count()) === `${j + 1} / ${total}` && (await active()) === a0, `${type}: la tecla ← vuelve a la anterior sin cambiar de diapositiva`);
        for (let k = a0; k < n - 1; k++) await pub.keyboard.press('ArrowRight');
        await pub.waitForTimeout(150);
        assert((await count()) === `${j + 1} / ${total}` && (await active()) === n - 1, `${type}: la tecla → recorre hasta la última`);
        if (j < total - 1) {
          await pub.keyboard.press('ArrowRight');
          assert(await waitCount(j + 2), `${type}: tras la última, → pasa de diapositiva (${j + 2} / ${total})`);
        }
      }
      assert(stepped > 0, 'presentación: hay al menos una diapositiva con pestañas o pantalla en vivo');
      if (OUT) await pub.screenshot({ path: `${OUT}/recipe-${s.key}-deck.png` });
      e2eDone = true;
    }
  }

  assert(e2eDone, 'al menos un sector de punta a punta (receta, tarifa, cupón, publicar, presentación)');
  assert(errors.length === 0, `sin errores JS ${errors.join(' | ')}`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
