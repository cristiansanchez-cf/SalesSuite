/**
 * Auditoría de idiomas (docs/I18N.md): cada clave en los cuatro idiomas y ningún texto en inglés o coreano copiado del
 * español.   npx tsx scripts/i18n-audit-messages.ts
 */
import { readdirSync } from 'node:fs';
const dir = new URL('../src/lib/i18n/messages/', import.meta.url).pathname;
const flat = (o: any, p = '', out: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = p ? `${p}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (typeof v === 'function') { try { const r = (v as any)('X', 'Y', 'Z'); if (typeof r === 'string') out[key] = r; } catch { /* */ } }
    else if (v && typeof v === 'object') flat(v, key, out);
  }
  return out;
};
const ES_WORD = /\b(de|la|el|que|para|con|tu|tus|sin|una|los|las|del|cuando|desde|aquí|más|también|cómo|qué|está)\b|[ñáéíóú¿¡]/i;
(async () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    const mod = await import(dir + f);
    for (const [name, group] of Object.entries(mod) as any) {
      if (!group || typeof group !== 'object' || !group.es || !group.en) continue;
      const es = flat(group.es), en = flat(group.en), ko = flat(group.ko ?? {}); console.error(f, name, Object.keys(es).length, Object.keys(en).length, Object.keys(ko).length);
      for (const k of Object.keys(es)) {
        for (const [lang, d] of [['en', en], ['ko', ko]] as const) {
          const v = d[k];
          if (v === undefined) { console.log(`${f} ${name} ${lang} FALTA ${k}`); continue; }
          if (v === es[k] && ES_WORD.test(v) && v.length > 3) console.log(`${f} ${name} ${lang} IGUAL ${k}: ${v.slice(0, 80)}`);
          else if (lang === 'ko' && /[ñáéíóú¿¡]/.test(v)) console.log(`${f} ${name} ko ACENTOS ${k}: ${v.slice(0, 80)}`);
          else if (lang === 'en' && /[ñ¿¡]|\b(de la|para|con el|que el)\b/.test(v)) console.log(`${f} ${name} en ESPAÑOL? ${k}: ${v.slice(0, 80)}`);
        }
      }
    }
  }
})();
