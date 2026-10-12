/**
 * Fichas de promotora y de DJ (docs/CRM_DINAMICO.md §24, criterio de Cristian, 12-oct-2026). Comparten la empresa por
 * debajo (dueño, historial, personas, «Trabaja con»), pero no son locales: ni formato, ni aforo, ni Google Maps.
 *
 * Promotora: lo que importa es dónde trabaja (con días y frecuencia, en los enlaces) y si es de las que montan
 * dinámicas, juegos y contenido (esas quieren peticiones, pantalla y álbum). Las de techno o de «cartel de DJs y punto»
 * se suelen descartar. La fidelización no le aplica.
 * DJ: si es residente en algún sitio que nos interese, cuántos seguidores tiene (su caché: a un DJ grande no le
 * sirve «te doy lo que genere tu local»; a uno residente, sí), si quiere darse a conocer y su estilo.
 * Las respuestas van en la misma `qualification` (jsonb) que las del local, con sus propias claves.
 */
import type { Fit, Priority } from './priority';

export const STYLES = ['international', 'erasmus', 'commercial', 'latin', 'pop', 'lgtb', 'tardeo', 'house', 'techno', 'lineup'] as const;
export type Style = (typeof STYLES)[number];
/** Estilos con los que no solemos encajar (se suelen descartar): no puntúan y avisan. */
export const OFF_STYLES: readonly Style[] = ['techno', 'lineup'];

export const PROMOTER_OPTIONS = {
  pdyn: { yes: 1, partly: 0.5, no: 0 },              // ¿hace dinámicas, juegos, concursos?
  pcontent: { yes: 1, partly: 0.5, no: 0 },          // ¿cuida el contenido y las redes?
  pevents: { '1': 0.3, '2-3': 0.7, '4+': 1 },        // eventos al mes
  pagent: { yes: 1, maybe: 0.5, no: 0 },             // ¿la veo llevando Enjoy a las salas?
} as const;
export const PROMOTER_WEIGHTS = { pdyn: 35, pstyle: 20, pevents: 20, pcontent: 15, pagent: 10 } as const;

export const DJ_OPTIONS = {
  dres: { yes: 1, no: 0.2 },                                        // residente en algún sitio que nos interese
  dfollow: { '<1k': 0.5, '1-10k': 1, '10-50k': 0.6, '50k+': 0.15 }, // seguidores: el grande no es para nosotros
  dgrow: { yes: 1, no: 0.3 },                                       // quiere darse a conocer
} as const;
export const DJ_WEIGHTS = { dres: 40, dfollow: 25, dgrow: 20, dstyle: 15 } as const;
/** El caché que se le supone por sus seguidores. */
export const CACHE_OF: Record<keyof typeof DJ_OPTIONS.dfollow, 'small' | 'medium' | 'big'> = { '<1k': 'small', '1-10k': 'small', '10-50k': 'medium', '50k+': 'big' };

/** Valores válidos de cada clave (para validar lo que llega de la ficha o de la IA). */
export const PROFILE_VALUES: Record<string, readonly string[]> = {
  pstyle: STYLES, dstyle: STYLES,
  ...Object.fromEntries(Object.entries({ ...PROMOTER_OPTIONS, ...DJ_OPTIONS }).map(([k, v]) => [k, Object.keys(v)])),
};
export const PROFILE_MULTI = ['pstyle', 'dstyle'];

type Q = Record<string, unknown>;
const list = (q: Q, k: string): Style[] => (Array.isArray(q[k]) ? (q[k] as string[]) : q[k] ? [String(q[k])] : []).filter((x): x is Style => (STYLES as readonly string[]).includes(x));
/** Estilo: encaja si tiene alguno de los nuestros; 0 si solo tiene de los que se descartan. */
const styleFraction = (s: Style[]): number | null => (!s.length ? null : s.some((x) => !OFF_STYLES.includes(x)) ? 1 : 0);
export const offStyle = (q: Q, key: 'pstyle' | 'dstyle') => { const s = list(q, key); return s.length > 0 && s.every((x) => OFF_STYLES.includes(x)); };

function score(parts: Array<{ key: string; weight: number; f: number | null }>): Pick<Priority, 'score' | 'max' | 'parts' | 'unknown' | 'qualified'> {
  const ps = parts.map((p) => ({ key: p.key, weight: p.weight, points: p.f === null ? null : Math.round(p.f * p.weight * 10) / 10 }));
  const known = ps.reduce((s, p) => s + (p.points ?? 0), 0);
  const max = known + ps.filter((p) => p.points === null).reduce((s, p) => s + p.weight, 0);
  const unknown = ps.filter((p) => p.points === null).map((p) => p.key);
  return { score: Math.round(known), max: Math.round(max), parts: ps as Priority['parts'], unknown: unknown as Priority['unknown'], qualified: !unknown.length };
}
const pick = <T extends Record<string, number>>(o: T, v: unknown): number | null => (typeof v === 'string' && v in o ? o[v as keyof T] : null);
const kills = (q: Q): Priority['kills'] => (['coverage', 'validate', 'debt'] as const).filter((k) => q[k]);

/** Qué le encaja a una promotora: peticiones (fiesta con público que pide), pantalla y dinámicas, álbum (contenido). */
export function promoterFit(q: Q): Record<'requests' | 'screen' | 'photos', Fit> {
  const s = list(q, 'pstyle');
  const requests: Fit = !s.length ? null : s.some((x) => !OFF_STYLES.includes(x)) ? 'yes' : 'no';
  const screen: Fit = q.pdyn === 'yes' ? 'yes' : q.pdyn === 'partly' ? 'maybe' : q.pdyn === 'no' ? 'no' : null;
  const photos: Fit = q.pcontent === 'yes' ? 'yes' : q.pcontent === 'partly' ? 'maybe' : q.pcontent === 'no' ? 'no' : null;
  return { requests, screen, photos };
}

export function promoterPriority(q: Q): Priority {
  const k = kills(q);
  const r = score([
    { key: 'pdyn', weight: PROMOTER_WEIGHTS.pdyn, f: pick(PROMOTER_OPTIONS.pdyn, q.pdyn) },
    { key: 'pstyle', weight: PROMOTER_WEIGHTS.pstyle, f: styleFraction(list(q, 'pstyle')) },
    { key: 'pevents', weight: PROMOTER_WEIGHTS.pevents, f: pick(PROMOTER_OPTIONS.pevents, q.pevents) },
    { key: 'pcontent', weight: PROMOTER_WEIGHTS.pcontent, f: pick(PROMOTER_OPTIONS.pcontent, q.pcontent) },
    { key: 'pagent', weight: PROMOTER_WEIGHTS.pagent, f: pick(PROMOTER_OPTIONS.pagent, q.pagent) },
  ]);
  const f = promoterFit(q);
  return { ...r, out: k.length > 0, kills: k, score: k.length ? 0 : r.score, max: k.length ? 0 : r.max, kind: 'promoter',
    fit: { screen: f.screen, requests: f.requests, photos: f.photos, loyalty: null } };
}

export function djPriority(q: Q): Priority {
  const k = kills(q);
  const r = score([
    { key: 'dres', weight: DJ_WEIGHTS.dres, f: pick(DJ_OPTIONS.dres, q.dres) },
    { key: 'dfollow', weight: DJ_WEIGHTS.dfollow, f: pick(DJ_OPTIONS.dfollow, q.dfollow) },
    { key: 'dgrow', weight: DJ_WEIGHTS.dgrow, f: pick(DJ_OPTIONS.dgrow, q.dgrow) },
    { key: 'dstyle', weight: DJ_WEIGHTS.dstyle, f: styleFraction(list(q, 'dstyle')) },
  ]);
  const s = list(q, 'dstyle');
  const requests: Fit = q.dres === 'yes' ? 'yes' : !s.length ? null : s.some((x) => !OFF_STYLES.includes(x)) ? 'maybe' : 'no';
  return { ...r, out: k.length > 0, kills: k, score: k.length ? 0 : r.score, max: k.length ? 0 : r.max, kind: null,
    fit: { screen: null, requests, photos: null, loyalty: null } };
}

