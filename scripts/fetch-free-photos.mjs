/**
 * Fotos de ejemplo libres de derechos para el álbum, el móvil y la pantalla (fiestas, conciertos, bodas).
 * Solo CC0 o dominio público (Openverse): uso comercial sin atribución. Aun así se guarda el origen de cada una.
 * Lo ejecuta GitHub Actions (aquí no hay internet): «Fotos libres» → Run workflow.
 *
 *   node scripts/fetch-free-photos.mjs [n=24]  → tenants/enjoy/assets/img/album/*.webp + public/demo/… + CREDITS.md
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const N = Number(process.argv[2] ?? 24);
const QUERIES = ['party crowd', 'nightclub dancing', 'concert crowd', 'friends party', 'wedding dance', 'dj party', 'festival crowd', 'birthday party'];
const OUT = ['tenants/enjoy/assets/img/album', 'public/demo/enjoy/img/album'];
const seen = new Set();
const picked = [];

for (const q of QUERIES) {
  if (picked.length >= N) break;
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&license_type=commercial&size=large&aspect_ratio=square,tall,wide&page_size=20&mature=false`;
  const r = await fetch(url, { headers: { 'user-agent': 'SalesSuite demo photos (github actions)' } });
  if (!r.ok) { console.warn(`! ${q}: ${r.status}`); continue; }
  const { results = [] } = await r.json();
  for (const it of results) {
    if (picked.length >= N || picked.filter((p) => p.q === q).length >= Math.ceil(N / QUERIES.length) + 1) break;
    if (seen.has(it.url) || !/^(cc0|pdm)$/.test(it.license) || (it.width && it.width < 900)) continue;
    seen.add(it.url);
    try {
      const img = await fetch(it.url, { headers: { 'user-agent': 'SalesSuite demo photos' }, signal: AbortSignal.timeout(20000) });
      if (!img.ok) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      const webp = await sharp(buf).rotate().resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true }).webp({ quality: 68 }).toBuffer();
      if (webp.length < 20_000) continue;
      const name = `fiesta-${String(picked.length + 1).padStart(2, '0')}.webp`;
      for (const d of OUT) { await mkdir(d, { recursive: true }); await writeFile(join(d, name), webp); }
      picked.push({ name, q, title: it.title ?? '', creator: it.creator ?? '', license: it.license, source: it.foreign_landing_url ?? it.url });
      console.log(`✓ ${name} ← ${q} · ${it.license} · ${it.title ?? ''}`);
    } catch (e) { console.warn(`! ${it.url}: ${e.message}`); }
  }
}
const credits = ['# Fotos de ejemplo (libres de derechos)', '', 'CC0 o dominio público (Openverse): uso comercial sin atribución. Origen de cada una, por si acaso:', '',
  '| Archivo | Título | Autor | Licencia | Origen |', '|---|---|---|---|---|',
  ...picked.map((p) => `| ${p.name} | ${p.title.replace(/\|/g, ' ')} | ${p.creator.replace(/\|/g, ' ')} | ${p.license.toUpperCase()} | ${p.source} |`)];
for (const d of OUT) await writeFile(join(d, 'CREDITS.md'), credits.join('\n') + '\n');
console.log(`\n${picked.length} fotos.`);
if (picked.length < 8) process.exit(1);
