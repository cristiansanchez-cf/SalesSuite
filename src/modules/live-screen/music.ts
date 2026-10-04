/**
 * Canciones de ejemplo por estilo musical, para que la propuesta suene a SU local: a un bar de rock no se le enseña
 * reguetón. Se elige un estilo por propuesta (Personalizar). Las carátulas las resuelve el alta del espacio
 * (scripts/tenant-bootstrap.ts, API pública de iTunes) y viajan en las props del módulo; sin ellas, un vinilo de color.
 */
export interface Song { song: string; artist: string; cover?: string | null }
export interface MusicStyle { label: string; songs: Song[] }

export const MUSIC_STYLES: Record<string, MusicStyle> = {
  'exitos-es': {
    label: 'Éxitos en España',
    songs: [
      { song: 'DtMF', artist: 'Bad Bunny' },
      { song: 'Si Antes Te Hubiera Conocido', artist: 'Karol G' },
      { song: 'Columbia', artist: 'Quevedo' },
      { song: 'cómo dormiste?', artist: 'Rels B' },
      { song: 'La Villa', artist: 'Ryan Castro' },
      { song: 'Superestrella', artist: 'Aitana' },
    ],
  },
  reggaeton: {
    label: 'Reguetón y urbano',
    songs: [
      { song: 'Tití Me Preguntó', artist: 'Bad Bunny' },
      { song: 'Provenza', artist: 'Karol G' },
      { song: 'Classy 101', artist: 'Feid' },
      { song: 'Gasolina', artist: 'Daddy Yankee' },
      { song: 'Todo de Ti', artist: 'Rauw Alejandro' },
      { song: 'Real Gangsta Love', artist: 'Trueno' },
    ],
  },
  rock: {
    label: 'Rock',
    songs: [
      { song: "Livin' on a Prayer", artist: 'Bon Jovi' },
      { song: 'Mr. Brightside', artist: 'The Killers' },
      { song: "Don't Stop Me Now", artist: 'Queen' },
      { song: 'Highway to Hell', artist: 'AC/DC' },
      { song: 'Soldadito Marinero', artist: 'Fito y Fitipaldis' },
      { song: 'R U Mine?', artist: 'Arctic Monkeys' },
    ],
  },
  'clasicos-es': {
    label: 'Clásicos españoles',
    songs: [
      { song: 'Devuélveme a Mi Chica', artist: 'Hombres G' },
      { song: 'Aserejé', artist: 'Las Ketchup' },
      { song: 'Me Cuesta Tanto Olvidarte', artist: 'Mecano' },
      { song: 'Rosas', artist: 'La Oreja de Van Gogh' },
      { song: 'Macarena', artist: 'Los del Río' },
      { song: 'Mi Gran Noche', artist: 'Raphael' },
    ],
  },
  internacional: {
    label: 'Internacional',
    songs: [
      { song: 'Like a Prayer', artist: 'Madonna' },
      { song: 'Blinding Lights', artist: 'The Weeknd' },
      { song: 'Levitating', artist: 'Dua Lipa' },
      { song: 'Dancing Queen', artist: 'ABBA' },
      { song: 'Billie Jean', artist: 'Michael Jackson' },
      { song: 'One Kiss', artist: 'Calvin Harris & Dua Lipa' },
    ],
  },
  francia: {
    label: 'Éxitos en Francia',
    songs: [
      { song: 'Djadja', artist: 'Aya Nakamura' },
      { song: 'Alors on danse', artist: 'Stromae' },
      { song: 'Dernière danse', artist: 'Indila' },
      { song: 'Bella', artist: 'Gims' },
      { song: 'Balance ton quoi', artist: 'Angèle' },
      { song: 'One More Time', artist: 'Daft Punk' },
    ],
  },
};

export const DEFAULT_STYLE = 'exitos-es';

/** Qué tiene el cliente contratado/activado: lo que no tenga no se enseña (ni pantallas ni pasos del móvil). */
export interface Features { songs: boolean; photos: boolean; messages: boolean; album: boolean }
export const ALL_FEATURES: Features = { songs: true, photos: true, messages: true, album: true };
export const featuresOf = (f: Partial<Features> | null | undefined): Features => ({ ...ALL_FEATURES, ...(f ?? {}) });

/** Un resultado de la búsqueda de iTunes (lo que se usa). */
export interface StoreTrack { artistName?: string; trackName?: string; collectionName?: string; artworkUrl100?: string }

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Versiones que no son la original: karaokes, covers, tributos, instrumentales… */
const NOT_ORIGINAL = /karaoke|cover|tribute|tributo|made famous|in the style|originally performed|instrumental|version de|versión de|lullaby|piano/i;

/**
 * La carátula de la canción original: el artista tiene que ser el mismo (iTunes devuelve a veces antes una versión
 * de otro) y el título, el de la canción. Si ninguna encaja, ninguna: mejor un vinilo de color que la portada de un cover.
 */
export function pickOriginal(results: StoreTrack[], artist: string, song: string): StoreTrack | null {
  const a = norm(artist), s = norm(song);
  return results.find((r) => {
    const ra = norm(r.artistName ?? ''), rt = norm(r.trackName ?? '');
    if (!r.artworkUrl100 || !ra || !rt) return false;
    if (NOT_ORIGINAL.test(`${r.artistName} ${r.trackName} ${r.collectionName ?? ''}`)) return false;
    const sameArtist = ra === a || ra.startsWith(`${a} `) || ra.split(/ (?:feat|ft|x|y|and|&) /)[0] === a || ra.includes(a);
    return sameArtist && (rt === s || rt.startsWith(s));
  }) ?? null;
}
