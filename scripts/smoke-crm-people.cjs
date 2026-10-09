/**
 * Smoke del CRM, fase 2 (docs/CRM_DINAMICO.md): alta rápida con «¿dónde?», persona en dos empresas, grupo de un nivel,
 * mover en bloque, importar un CSV con vista previa y deshacerlo.
 *   npm run build && npm run start:demo ; node scripts/smoke-crm-people.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
// Datos inventados: los CSV reales no entran en el repo.
const CSV = 'Name,Empresa/Local,Rol,Ciudad,Status,Acción recomendada\n'
  + 'Nora Smoke,Sala Smoke,Owner,Valencia,No comenzado,Valorar\n'
  + 'Nora Smoke,Sala Smoke,Owner,Valencia,No comenzado,Valorar\n'
  + 'Pablo Smoke,CEO,,Bilbao,Investigado,Omitir\n'
  + 'Rita Smoke,Club Sol,DJ,Valencia,Hablando,Solicitar reunión\n';

(async () => {
  const b = await chromium.launch();
  const login = async (who) => {
    const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${who}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };

  // ---- el comercial da de alta a alguien y su empresa al vuelo
  const rep = await login('rep@enjoy.test');
  await rep.goto(`${BASE}/admin/accounts`);
  assert(await rep.isVisible('[data-testid=tab-people]'), 'pestañas Empresas · Personas en Cuentas');
  await rep.click('[data-testid=tab-people]');
  await rep.waitForURL(/\/admin\/people/);
  assert(await rep.isVisible('[data-testid=person][data-name="Marta Ruiz"]'), 'directorio con la persona de ejemplo');
  await rep.click('[data-testid=person-add]');
  await rep.fill('[data-testid=quick-add-form] [name=name]', 'Bruno Smoke');
  await rep.fill('[data-testid=quick-where]', 'La Brecha Smoke');
  await rep.fill('[data-testid=quick-add-form] [name=role]', 'Fundador');
  await rep.click('[data-testid=quick-create]');
  await rep.waitForURL(/ok=created/);
  const row = await rep.textContent('[data-testid=person][data-name="Bruno Smoke"]');
  assert(row.includes('Fundador · La Brecha Smoke'), 'alta rápida: persona + empresa nueva con su papel');
  if (OUT) await rep.screenshot({ path: `${OUT}/crm-people.png`, fullPage: true });

  // ---- la misma persona en otra empresa
  await rep.click('[data-testid=person][data-name="Bruno Smoke"] a');
  await rep.waitForURL(/\/admin\/people\/[^/?]+$/);
  await rep.fill('[data-testid=person-link] [name=company]', 'Club Sol');
  await rep.fill('[data-testid=person-link] [name=role]', 'DJ');
  await Promise.all([rep.waitForURL(/ok=linked/), rep.click('[data-testid=person-link] button')]);
  const comp = await rep.textContent('[data-testid=person-companies]');
  assert(comp.includes('Club Sol') && comp.includes('La Brecha Smoke'), 'una persona en dos empresas');
  if (OUT) await rep.screenshot({ path: `${OUT}/crm-person.png`, fullPage: true });

  // ---- la ficha de la empresa enseña a su gente y se mete en un grupo
  await rep.click('[data-testid=person-companies] [data-name="Club Sol"] a');
  await rep.waitForURL(/\/admin\/accounts\/[^/?]+$/);
  const people = await rep.textContent('[data-testid=account-people-list]');
  assert(people.includes('Marta Ruiz') && people.includes('Bruno Smoke'), 'la empresa enseña a sus personas');
  await rep.fill('[data-testid=group-name]', 'Grupo Costa Smoke');
  await Promise.all([rep.waitForURL(/ok=group/), rep.click('[data-testid=group-save]')]);
  assert((await rep.textContent('[data-testid=account-group]')).includes('Grupo Costa Smoke'), 'grupo creado al vuelo');
  if (OUT) await rep.screenshot({ path: `${OUT}/crm-account-people.png`, fullPage: true });

  // ---- el admin mueve en bloque a un grupo
  const adm = await login('admin@enjoy.test');
  await adm.goto(`${BASE}/admin/accounts?ver=all`);
  await adm.check('[data-testid=account][data-name="Sala Marina"] [data-bulk]');
  await adm.check('[data-testid=account][data-name="Terraza Azahar"] [data-bulk]');
  assert(await adm.isVisible('[data-testid=bulk-bar]'), 'barra de selección');
  await adm.click('[data-testid=bulk-move]');
  await adm.fill('[data-testid=bulk-group-name]', 'Grupo Costa Smoke');
  await Promise.all([adm.waitForURL(/ok=moved/), adm.click('[data-testid=bulk-move-confirm]')]);
  assert((await adm.textContent('[data-testid=account][data-name="Sala Marina"]')).includes('Grupo Costa Smoke'), 'movidas al grupo');

  // ---- importar un CSV de personas, con vista previa, y deshacer
  await adm.goto(`${BASE}/admin/import`);
  await adm.check('[data-testid=import-target-contact] input', { force: true });
  await adm.setInputFiles('[data-testid=import-file]', { name: 'congreso.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await Promise.all([adm.waitForURL(/\/admin\/import\/[^/?]+$/), adm.click('[data-testid=import-submit]')]);
  assert((await adm.locator('[data-testid=import-column]').count()) === 6, 'una tarjeta por columna');
  await adm.fill('[data-testid=import-tag]', 'smoke');
  await Promise.all([adm.waitForURL(/preview=1/), adm.click('[data-testid=import-preview]')]);
  const plan = await adm.textContent('[data-testid=import-plan]');
  assert(/Personas nuevas\s*3/.test(plan) && /Filas repetidas[^0-9]*1/.test(plan), 'vista previa: 3 personas, 1 fila repetida');
  if (OUT) await adm.screenshot({ path: `${OUT}/crm-import.png`, fullPage: true });
  await Promise.all([adm.waitForURL(/ok=done/), adm.click('[data-testid=import-run]')]);
  await adm.goto(`${BASE}/admin/people?lista=smoke`);
  assert((await adm.locator('[data-testid=person]').count()) === 3, 'importadas en su lista');
  assert(await adm.isVisible('[data-testid=stage-chips]'), 'etapas de la lista como chips');
  await adm.goto(`${BASE}/admin/import`);
  await adm.click('[data-testid=import-undo]');
  await Promise.all([adm.waitForNavigation(), adm.click('[data-testid=undo-dialog] button[type=submit]')]);
  await adm.goto(`${BASE}/admin/people?lista=smoke`);
  assert((await adm.locator('[data-testid=person]').count()) === 0, 'deshecha: no queda nadie de la lista');
  await adm.goto(`${BASE}/admin/accounts?ver=all`);
  assert(await adm.isVisible('[data-testid=account][data-name="Club Sol"]') && !(await adm.isVisible('[data-testid=account][data-name="Sala Smoke"]')), 'deshecha: la empresa creada se va, la que existía se queda');

  // ---- el comercial no importa
  await rep.goto(`${BASE}/admin/import`);
  assert(!(await rep.isVisible('[data-testid=import-upload]')), 'el comercial no entra en Importar');
  await b.close();
})();
