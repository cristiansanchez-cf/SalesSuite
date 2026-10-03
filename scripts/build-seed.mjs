#!/usr/bin/env node
/**
 * Genera supabase/seed.sql a partir de supabase/seed/fixtures.json (fuente única que también usa
 * el modo DEMO). Ejecutar tras editar fixtures: `npm run db:seed:build`.
 * Nota: tenant_id de module_version/dossier_item/share_link lo rellena el trigger desde el padre.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fx = JSON.parse(readFileSync(`${root}supabase/seed/fixtures.json`, 'utf8'));

const ORDER = ['tenant', 'domain', 'module', 'module_version', 'segment', 'persona', 'segment_module', 'persona_module', 'dossier', 'dossier_item', 'share_link', 'play', 'dossier_contact'];
const JSON_COLS = new Set(['technique_refs', 'brand', 'theme_tokens', 'default_props', 'prop_overrides', 'prospect_meta', 'theme_override', 'verification']);
const DERIVED = new Set(['tenant_id']);
const derivedTables = new Set(['module_version', 'dossier_item', 'share_link']);

const lit = (col, v) => {
  if (v === null || v === undefined) return 'null';
  if (JSON_COLS.has(col)) {
    const s = JSON.stringify(v);
    if (s.includes('$json$')) throw new Error('fixture contiene $json$');
    return `$json$${s}$json$::jsonb`;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // Literal de array sin tipo ('{"a","b"}'): Postgres lo convierte a text[] o a arrays de enum según la columna.
  if (Array.isArray(v)) return `'{${v.map((x) => `"${String(x).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll("'", "''")}"`).join(',')}}'`;
  return `'${String(v).replaceAll("'", "''")}'`;
};

let out = '-- GENERADO por scripts/build-seed.mjs desde supabase/seed/fixtures.json. No editar a mano.\n';
out += '-- Usuarios/membership no se siembran: ver docs/ONBOARDING_TENANT.md.\n\nbegin;\n';
for (const table of ORDER) {
  for (const row of fx[table] ?? []) {
    const cols = Object.keys(row).filter((c) => !(derivedTables.has(table) && DERIVED.has(c)));
    out += `insert into public.${table} (${cols.join(', ')}) values (${cols.map((c) => lit(c, row[c])).join(', ')});\n`;
  }
  out += '\n';
}
out += 'commit;\n';
writeFileSync(`${root}supabase/seed.sql`, out);
console.log('supabase/seed.sql generado');
