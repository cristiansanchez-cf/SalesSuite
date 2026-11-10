/**
 * De qué idioma es un texto escrito por el equipo (es, en, pt, ko), sin IA y sin dependencias: lo usa el navegador
 * para saber si enseña «Traducir». Por la escritura (hangul → coreano) y, en alfabeto latino, por palabras muy
 * frecuentes de cada idioma. null si no se sabe (texto corto, nombres, cifras): entonces no se ofrece traducir.
 */
const WORDS: Record<'es' | 'en' | 'pt', string[]> = {
  es: ['el', 'la', 'los', 'las', 'que', 'de', 'y', 'en', 'un', 'una', 'con', 'por', 'para', 'es', 'no', 'se', 'lo', 'del', 'al', 'muy', 'pero', 'tiene', 'hay', 'quiere', 'dice', 'está'],
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'it', 'that', 'for', 'with', 'they', 'we', 'he', 'she', 'has', 'have', 'not', 'but', 'are', 'was', 'wants', 'said'],
  pt: ['o', 'os', 'as', 'que', 'de', 'e', 'em', 'um', 'uma', 'com', 'por', 'para', 'é', 'não', 'se', 'do', 'da', 'dos', 'das', 'muito', 'mas', 'tem', 'quer', 'está', 'ele', 'ela'],
};
const SETS = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v)])) as Record<'es' | 'en' | 'pt', Set<string>>;

export function guessLang(text: string): 'es' | 'en' | 'pt' | 'ko' | null {
  const t = text.trim();
  if (t.length < 4) return null;
  const hangul = (t.match(/[가-힯ᄀ-ᇿ㄰-㆏]/g) ?? []).length;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return null;
  if (hangul / letters > 0.3) return 'ko';
  const words = t.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 3) return null;
  const score = (k: 'es' | 'en' | 'pt') => words.filter((w) => SETS[k].has(w)).length;
  // Marcas que deciden entre español y portugués cuando comparten palabras.
  const pt = score('pt') + (/[ãõç]|ção\b|ões\b/.test(t.toLowerCase()) ? 3 : 0);
  const es = score('es') + (/ñ|¿|¡|ción\b/.test(t.toLowerCase()) ? 3 : 0);
  const en = score('en');
  const best = Math.max(es, en, pt);
  if (best === 0) return null;
  return best === es && es > pt ? 'es' : best === pt && pt > es ? 'pt' : best === en ? 'en' : es >= pt ? 'es' : 'pt';
}
