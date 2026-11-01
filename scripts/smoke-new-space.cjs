/**
 * Smoke de «Nueva empresa» en Plataforma (docs/ORG.md §Alta de una empresa): el superadmin crea el espacio de una empresa
 * con su dirección y su admin; sale en Plataforma, la dirección ya responde con su nombre y su admin entra a configurarla:
 * le da su web y un documento al agente de alta, contesta lo que falta, lo afina e importa.
 *   npm run build && npm run start:demo ; node scripts/smoke-new-space.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const login = async (base, email) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
    await p.goto(`${base}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };

  // ---- Solo el superadmin.
  const adm = await login(BASE, 'admin@enjoy.test');
  assert((await adm.goto(`${BASE}/admin/platform`)).status() === 403, 'un admin normal no crea empresas');

  // ---- Alta: nombre (la dirección se rellena sola), idioma y su admin.
  const sup = await login(BASE, 'super@cofundo.test');
  await sup.goto(`${BASE}/admin/platform`);
  await sup.click('[data-testid=new-space] summary').catch(() => {});
  await sup.fill('[data-testid=new-space-form] [name=name]', 'Ocean Dive Lab');
  assert((await sup.inputValue('[data-testid=new-space-form] [name=slug]')) === 'ocean-dive-lab', 'la dirección sale del nombre');
  await sup.selectOption('[data-testid=new-space-form] [name=locale]', 'en-GB');
  await sup.fill('[data-testid=new-space-form] [name=adminEmail]', 'ana@oceandive.test');
  await Promise.all([sup.waitForURL(/ok=created/), sup.click('[data-testid=new-space-create]')]);
  assert((await sup.textContent('[data-testid=space-created]')).includes('Ocean Dive Lab'), 'creada, con el siguiente paso');
  assert(await sup.isVisible('[data-testid=platform-space][data-slug=ocean-dive-lab]'), 'sale en Plataforma');
  const doneOf = async () => Number(await sup.getAttribute('[data-testid=platform-space][data-slug=ocean-dive-lab] [data-testid=platform-setup]', 'data-done'));
  assert((await doneOf()) === 1, 'estado del alta: solo su admin');
  assert(/ocean-dive-lab\.localhost(:\d+)?\/admin\/setup\/agente$/.test(await sup.getAttribute('[data-testid=platform-space][data-slug=ocean-dive-lab] [data-step=empresa]', 'href') ?? ''), 'cada paso lleva a su sitio en su espacio');
  const configure = await sup.getAttribute('[data-testid=space-configure]', 'href');
  assert(/^http:\/\/ocean-dive-lab\.localhost(:\d+)?\/admin\/setup\/ia\?first=1$/.test(configure ?? ''), `«Entrar y configurar» va a su configuración (${configure})`);

  // ---- La misma dirección otra vez: no.
  await sup.click('[data-testid=new-space] summary').catch(() => {});
  await sup.fill('[data-testid=new-space-form] [name=name]', 'Ocean Dive Lab');
  await sup.click('[data-testid=new-space-create]');
  await sup.waitForSelector('[data-testid=new-space] [data-testid=error]');
  assert((await sup.textContent('[data-testid=new-space] [data-testid=error]')).includes('Ya hay un espacio'), 'dirección repetida: avisa');

  // ---- Su dirección ya es su espacio, y su admin entra a configurarlo.
  const origin = new URL(configure).origin;
  const ana = await login(origin, 'ana@oceandive.test');
  await ana.goto(configure);
  assert(/\/admin\/setup/.test(ana.url()), `su admin llega a la configuración (${ana.url()})`);
  assert((await ana.title()).includes('Ocean Dive Lab') || (await ana.textContent('body')).includes('Ocean Dive Lab'), 'con el nombre de su empresa');

  // ---- Agente de alta (docs/SETUP_WIZARD.md §Agente de alta): web + documento → borrador → contestar → afinar → importar.
  await Promise.all([ana.waitForURL(/\/admin\/setup\/agente/), ana.click('[data-testid=ai-agent-cta]')]);
  await ana.fill('[data-testid=agent-website]', 'oceandive.test');
  await ana.setInputFiles('[data-testid=agent-files]', { name: 'tarifas.txt', mimeType: 'text/plain', buffer: Buffer.from('Bautismos de buceo para empresas.') });
  await Promise.all([ana.waitForSelector('[data-testid=agent-draft]', { timeout: 60000 }), ana.click('[data-testid=agent-start]')]);
  assert((await ana.textContent('[data-testid=agent-summary]')).includes('1 documento'), 'ha leído la web y el documento');
  assert((await ana.textContent('[data-testid=agent-block][data-block=mercado]')).includes('Empresas'), 'borrador: clientes y actores');
  assert((await ana.textContent('[data-testid=agent-block][data-block=precios]')).match(/Sin datos|No data/), 'sin precios en las fuentes: no se los inventa');
  assert((await ana.$$('[data-testid=agent-question]')).length === 1, 'y lo pregunta');
  await ana.fill('[data-testid=agent-question] [name=answer]', '450 € por grupo');
  await Promise.all([ana.waitForNavigation({ timeout: 60000 }), ana.click('[data-testid=agent-refine]')]);
  assert((await ana.textContent('[data-testid=agent-block][data-block=precios]')).includes('450'), 'afinado con su respuesta');
  assert((await ana.$$('[data-testid=agent-question]')).length === 0, 'ya no queda nada por preguntar');
  await ana.click('[data-testid=agent-import]');
  await ana.waitForURL(/\/admin\/setup\/ia\?b=listo&n=\d+/).catch(async (e) => { console.error('alerta:', await ana.textContent('[role=alert], .co-alert').catch(() => '')); throw e; });
  assert(Number(new URL(ana.url()).searchParams.get('n')) >= 6, `importado (${new URL(ana.url()).searchParams.get('n')} cosas)`);
  assert(await ana.isVisible('[data-testid=ai-check]'), 'y a comprobar que está bien');
  await ana.goto(`${origin}/admin/prices`);
  assert((await ana.textContent('body')).includes('Bautismo de grupo'), 'la tarifa ya está en Precios');
  // ---- Dónde vende (docs/ACCOUNTS.md §Zonas): escribe «Madrid» y se crea España › Comunidad de Madrid › Madrid.
  await ana.goto(`${origin}/admin/territory`);
  await ana.fill('[data-testid=zone-place-q]', 'Madrid');
  await ana.click('[data-testid=zone-place-list] [data-testid=zone-option] >> nth=0');
  await Promise.all([ana.waitForNavigation(), ana.click('[data-testid=place-add]')]);
  const zones = await ana.$$eval('[data-testid=zone]', (els) => els.map((e) => e.dataset.name));
  assert(zones.includes('España') && zones.includes('Comunidad de Madrid') && zones.some((z) => z === 'Madrid'), `Madrid, con todo lo que la contiene (${zones.join(' › ')})`);
  await ana.fill('[data-testid=zone-place-q]', 'Madrid');
  await ana.click('[data-testid=zone-place-list] [data-testid=zone-option] >> nth=0');
  await Promise.all([ana.waitForNavigation(), ana.click('[data-testid=place-add]')]);
  assert((await ana.$$('[data-testid=zone]')).length === zones.length, 'la misma otra vez: no se repite');

  await sup.goto(`${BASE}/admin/platform`);
  assert((await doneOf()) >= 5, `estado del alta al día en Plataforma (${await doneOf()} de 9)`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
