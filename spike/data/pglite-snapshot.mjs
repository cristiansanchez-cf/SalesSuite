// SPIKE (docs/SPIKE_DATA.md): arranque en frío desde un snapshot (lo que haría una demo serverless)
// y una consulta "como usuario" con RLS, sin PostgREST: SET ROLE + request.jwt.claims en una transacción.
// Uso: node spike/data/pglite-apply.mjs --no-tests --dump=/tmp/snap.tar.gz && node spike/data/pglite-snapshot.mjs /tmp/snap.tar.gz
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const mb = () => Math.round(process.memoryUsage().rss / 1048576);
const t0 = performance.now();
const loadDataDir = new Blob([readFileSync(process.argv[2])]);
const db = await PGlite.create({ loadDataDir, extensions: { pgcrypto } });
console.log(`arranque desde snapshot: ${Math.round(performance.now() - t0)} ms, rss ${mb()} MB`);

/** Lo que haría un DbClient "como usuario": misma semántica que PostgREST (rol + claims locales a la transacción). */
async function asUser(sub, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub, role: 'authenticated' })]);
    return fn(tx);
  });
}
const REP = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
await db.exec(`insert into auth.users (id, email) values ('${REP}', 'rep@enjoy.test'), ('${OTHER}', 'rep@retheme.test') on conflict do nothing;
  insert into public.membership (user_id, tenant_id, role) values ('${REP}', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('${OTHER}', '00000000-0000-4000-8000-000000000a01', 'rep') on conflict do nothing;`);

let t = performance.now();
const mine = await asUser(REP, (tx) => tx.query('select count(*)::int n from public.dossier'));
const theirs = await asUser(OTHER, (tx) => tx.query('select count(*)::int n from public.dossier'));
const anon = await db.transaction(async (tx) => {
  await tx.query(`select set_config('role', 'anon', true)`);
  return tx.query(`select public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') is not null as ok`);
});
console.log(`RLS sin PostgREST: rep Enjoy ve ${mine.rows[0].n} dossiers; rep de otro tenant ve ${theirs.rows[0].n}; anon por RPC: ${anon.rows[0].ok} (${Math.round(performance.now() - t)} ms)`);

t = performance.now();
for (let i = 0; i < 200; i++) await asUser(REP, (tx) => tx.query('select id, title from public.dossier order by updated_at desc'));
console.log(`200 lecturas con RLS: ${Math.round(performance.now() - t)} ms (${((performance.now() - t) / 200).toFixed(2)} ms/consulta), rss ${mb()} MB`);
await db.close();
