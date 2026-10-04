import { featuresOf, type Features } from '../live-screen/music';
import type { ClientMedia } from '~/lib/types';

/**
 * Los pasos del móvil y cómo se agrupan en diapositivas (modo presentación): 1–3 «entra», 4–6 «sale en pantalla»,
 * y lo demás. Lo que el cliente no tiene, fuera; un grupo vacío no es diapositiva.
 * Un módulo puede traer sus propios grupos (`parts`): cada paso con lo que hace el invitado y lo que significa
 * para quien paga («para ti»). Con precio 0 no hay paso de pago.
 */
export const STEP_KEYS = ['scan', 'home', 'sheet', 'form', 'pending', 'live', 'album', 'songs'] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export interface Step { key: string; label: string; says: string; owner?: string }
export interface CustomPart { title: string; lede?: string; steps: Array<{ key: StepKey; label?: string; says: string; owner?: string }> }
export interface Part { n: number; of: number; title: string; keys: string[]; lede?: string; steps?: Step[] }

export function stepsFor(f: Features, venue: string, price: number, dj = true): Step[] {
  const action = f.photos ? 'photo' : f.messages ? 'message' : null;
  const all = [
    { key: 'scan', label: 'Escanea', says: 'Apunta con la cámara al QR de la pantalla o de la mesa. Sin descargar nada.' },
    { key: 'home', label: 'Llega al evento', says: `Entra en la página de ${venue}: lo que puede hacer${dj ? ', el DJ' : ''} y ${f.songs ? 'las canciones más pedidas' : 'el álbum de la noche'}.` },
    { key: 'sheet', label: '¿Qué quiere hacer?', says: 'Elige y va directo: foto o mensaje en pantalla, o subir fotos al álbum.', on: f.photos || f.messages || f.album },
    { key: 'form', label: action === 'message' ? 'Su mensaje' : 'Su foto', says: 'Su nombre y una dedicatoria. El organizador lo revisa antes de que salga.', on: !!action },
    { key: 'pending', label: 'Pendiente', says: `Ha pagado ${price} €. Solo se cobra si se acepta; si no, se devuelve.`, on: !!action && price > 0 },
    { key: 'live', label: '¡En pantalla!', says: 'Sale en grande delante de todos. Y queda guardada en el álbum.', on: !!action },
    { key: 'album', label: 'Álbum', says: 'Todas las fotos de la noche, para todos. Las suyas, marcadas.', on: f.album },
    { key: 'songs', label: 'Pide su canción', says: 'Busca, pide y sube en la lista. Cuanta más gente la pide, antes suena.', on: f.songs },
  ];
  return all.filter((s) => s.on !== false).map(({ key, label, says }) => ({ key, label, says }));
}

const GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Escanea y entra', keys: ['scan', 'home', 'sheet'] },
  { title: 'Y sale en pantalla', keys: ['form', 'pending', 'live'] },
  { title: 'Y la noche sigue', keys: ['album', 'songs'] },
];

export function partsFor(media: ClientMedia | undefined, venue = '', price = 2, custom?: CustomPart[] | null, dj = true): Part[] {
  const base = stepsFor(featuresOf(media?.features), venue, price, dj);
  const have = new Set(base.map((s) => s.key));
  if (custom?.length) {
    // Grupos del módulo: sus textos, y solo los pasos que el cliente tiene (y sin pago si es gratis).
    const groups = custom
      .map((g) => ({
        title: g.title, lede: g.lede,
        steps: g.steps.filter((s) => have.has(s.key)).map((s) => ({ key: s.key, label: s.label ?? base.find((b) => b.key === s.key)!.label, says: s.says, owner: s.owner })),
      }))
      .filter((g) => g.steps.length);
    return groups.map((g, i) => ({ n: i + 1, of: groups.length, title: g.title, lede: g.lede, keys: g.steps.map((s) => s.key), steps: g.steps }));
  }
  const groups = GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => have.has(k)) })).filter((g) => g.keys.length);
  return groups.map((g, i) => ({ n: i + 1, of: groups.length, title: g.title, keys: g.keys }));
}
