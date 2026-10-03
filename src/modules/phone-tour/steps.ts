import { featuresOf, type Features } from '../live-screen/music';
import type { ClientMedia } from '~/lib/types';

/**
 * Los pasos del móvil y cómo se agrupan en diapositivas (modo presentación): 1–3 «entra», 4–6 «sale en pantalla»,
 * y lo demás. Lo que el cliente no tiene, fuera; un grupo vacío no es diapositiva.
 */
export interface Step { key: string; label: string; says: string }
export interface Part { n: number; of: number; title: string; keys: string[] }

export function stepsFor(f: Features, venue: string, price: number): Step[] {
  const action = f.photos ? 'photo' : f.messages ? 'message' : null;
  const all = [
    { key: 'scan', label: 'Escanea', says: 'Apunta con la cámara al QR de la pantalla o de la mesa. Sin descargar nada.' },
    { key: 'home', label: 'Llega al evento', says: `Entra en la página de ${venue}: lo que puede hacer, el DJ y ${f.songs ? 'las canciones más pedidas' : 'el álbum de la noche'}.` },
    { key: 'sheet', label: '¿Qué quiere hacer?', says: 'Elige y va directo: foto o mensaje en pantalla, o subir fotos al álbum.', on: f.photos || f.messages || f.album },
    { key: 'form', label: action === 'message' ? 'Su mensaje' : 'Su foto', says: 'Su nombre y una dedicatoria. El organizador lo revisa antes de que salga.', on: !!action },
    { key: 'pending', label: 'Pendiente', says: `Ha pagado ${price} €. Solo se cobra si se acepta; si no, se devuelve.`, on: !!action },
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

export function partsFor(media: ClientMedia | undefined, venue = '', price = 2): Part[] {
  const have = new Set(stepsFor(featuresOf(media?.features), venue, price).map((s) => s.key));
  const groups = GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => have.has(k)) })).filter((g) => g.keys.length);
  return groups.map((g, i) => ({ n: i + 1, of: groups.length, title: g.title, keys: g.keys }));
}
