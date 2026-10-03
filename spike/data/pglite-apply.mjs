// SPIKE (docs/SPIKE_DATA.md) — no es código de la app.
// ¿Aplica PGlite TODAS las migraciones + grants + seed y pasan los tests SQL de RLS/RPC?
// Uso: node spike/data/pglite-apply.mjs [--no-tests] [--dump=/ruta/snapshot.tar.gz]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sql = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/^\\set .*$/gm, ''); // los tests usan \set de psql
const mb = () => Math.round(process.memoryUsage().rss / 1048576);
const args = process.argv.slice(2);

const SQL_TESTS = [
  '20_rls.test.sql', '25_brand_team_storage.test.sql', '26_playbook.test.sql', '27_market.test.sql', '28_partner.test.sql',
  '29_evidence.test.sql', '31_team.test.sql', '32_notifications.test.sql', '33_accounts.test.sql', '34_commissions.test.sql',
  '35_coupons.test.sql', '36_conditions.test.sql',
];

export async function bootPglite({ seed = true, log = () => {} } = {}) {
  const t0 = performance.now();
  const db = await PGlite.create({ extensions: { pgcrypto } });
  log(`arranque PGlite: ${Math.round(performance.now() - t0)} ms, rss ${mb()} MB`);
  const step = async (label, text) => {
    const t = performance.now();
    await db.exec(text);
    log(`  ${label}: ${Math.round(performance.now() - t)} ms`);
  };
  await step('stub supabase', sql('supabase/tests/00_supabase_stub.sql'));
  for (const f of readdirSync(join(ROOT, 'supabase/migrations')).filter((x) => x.endsWith('.sql')).sort()) {
    await step(f, sql(`supabase/migrations/${f}`));
  }
  await step('grants', sql('supabase/tests/10_grants.sql'));
  if (seed) await step('seed', sql('supabase/seed.sql'));
  log(`listo: ${Math.round(performance.now() - t0)} ms, rss ${mb()} MB`);
  return db;
}

/** Ejecuta un fichero de test emulando el `\gset` de psql (select … \gset → variables :nombre). */
async function execPsqlLike(db, text) {
  const vars = {};
  const sub = (s) => s.replace(/(?<!:):([a-z_]+)\b/g, (m, k) => (k in vars ? String(vars[k]) : m));
  let rest = text;
  for (let i = rest.indexOf('\\gset'); i >= 0; i = rest.indexOf('\\gset')) {
    const head = rest.slice(0, i);
    const at = head.lastIndexOf('\nselect ');
    await db.exec(sub(head.slice(0, at)));
    const { rows } = await db.query(sub(head.slice(at)));
    Object.assign(vars, rows[0]);
    rest = rest.slice(i + 5);
  }
  await db.exec(sub(rest));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = performance.now();
  const db = await bootPglite({ log: console.log });
  if (!args.includes('--no-tests')) {
    let fail = 0;
    for (const f of SQL_TESTS) {
      const t = performance.now();
      try {
        // psql abre una conexión por fichero; aquí hay UNA sesión: DISCARD ALL = sesión nueva (rol, settings, temp).
        await db.exec('discard all');
        await execPsqlLike(db, sql(`supabase/tests/${f}`));
        console.log(`ok ${f} (${Math.round(performance.now() - t)} ms)`);
      } catch (e) {
        fail++;
        console.log(`FAIL ${f}: ${String(e.message).split('\n')[0]}`);
      }
    }
    console.log(fail ? `${fail} ficheros con fallos` : 'OK: todos los tests SQL pasan en PGlite');
    process.exitCode = fail ? 1 : 0;
  }
  const dump = args.find((a) => a.startsWith('--dump='));
  if (dump) {
    const blob = await db.dumpDataDir('gzip');
    writeFileSync(dump.slice(7), Buffer.from(await blob.arrayBuffer()));
    console.log(`snapshot: ${dump.slice(7)} (${Math.round(blob.size / 1024)} KB)`);
  }
  console.log(`total: ${Math.round(performance.now() - t0)} ms, rss máx aprox ${mb()} MB`);
  await db.close();
}
