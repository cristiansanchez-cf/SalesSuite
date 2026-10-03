#!/usr/bin/env node
/**
 * Reglas de copy de la consola que se pueden expresar como «esta cadena no debe aparecer» (guía de consolas, §13, §17, §18):
 *  - estados vacíos y errores sin salida;
 *  - lenguaje posicional («arriba», «abajo»): el layout cambia, la relación entre registros no.
 *  - emojis de colores (design system Cofundo: monocromo).
 * Los comentarios están exentos para poder escribir SOBRE la regla. Rompe el build (npm run lint:copy, CI).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/pages/admin', 'src/components/admin', 'src/components/ui', 'src/components/playbook', 'src/layouts/AdminLayout.astro', 'src/lib/admin', 'src/lib/evidence', 'src/lib/partner', 'src/lib/playbook', 'src/lib/setup'];
const BANNED = [
  /No hay datos/i, /Sin resultados/i, /Ha ocurrido un error/i, /Algo ha salido mal/i,
  /\b(la|el|los|las) de (arriba|abajo)\b/i, /\bmás (arriba|abajo)\b/i, /\b(de|ver) (arriba|abajo)\b/i,
  /\p{Emoji_Presentation}|\uFE0F/u,
];
const files = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) walk(join(p, f)); return; }
  if (/\.(astro|svelte|ts)$/.test(p) && !/\.(test|contract)\.ts$/.test(p)) files.push(p);
};
for (const r of ROOTS) walk(r);

const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

let bad = 0;
for (const f of files) {
  const lines = stripComments(readFileSync(f, 'utf8')).split('\n');
  lines.forEach((l, i) => {
    for (const re of BANNED) if (re.test(l)) { bad++; console.error(`${f}:${i + 1}: «${l.trim().slice(0, 100)}» incumple ${re}`); }
  });
}
if (bad) { console.error(`\n${bad} frase(s) prohibida(s) en la consola (ver scripts/lint-copy.mjs).`); process.exit(1); }
console.log(`lint:copy OK (${files.length} archivos)`);
