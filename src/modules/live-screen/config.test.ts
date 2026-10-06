import { describe, expect, test } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { screenConfig, type ScreenSource } from './config';
import { DEFAULT_STYLE, MUSIC_STYLES, type MusicStyle } from './music';
import { liveScreenSchema } from './schema';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const tenant = JSON.parse(readFileSync(`${root}tenants/enjoy/tenant.json`, 'utf8')) as { catalog: Array<{ key: string; block_type: string; props: Record<string, unknown> }> };
/** Como el alta: «asset:<ruta>» → URL pública (aquí, una de mentira con la misma ruta). */
const toUrl = <T>(v: T): T => {
  if (typeof v === 'string' && v.startsWith('asset:')) return `https://cdn.test/enjoy/${v.slice(6)}` as T;
  if (Array.isArray(v)) return v.map(toUrl) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toUrl(x)])) as T;
  return v;
};
const assetRefs = (v: unknown): string[] =>
  typeof v === 'string' ? (v.startsWith('asset:') ? [v.slice(6)] : []) : Array.isArray(v) ? v.flatMap(assetRefs) : v && typeof v === 'object' ? Object.values(v).flatMap(assetRefs) : [];

const SCENES = [{ scene: 'club.idle' }, { scene: 'club.song', text: 'Va por Marta' }, { scene: 'tp.idle', video: true }];
const base = (over: Partial<ScreenSource> = {}): ScreenSource => ({ venueName: 'Sala X', djName: 'DJ', photos: ['https://p/1.webp'], covers: [], autoplay: true, ...over });
const style = (covers: Array<string | null | undefined>, label = 'Prueba'): MusicStyle => ({
  label, songs: covers.map((c, i) => (c === undefined ? { song: `S${i}`, artist: `A${i}` } : { song: `S${i}`, artist: `A${i}`, cover: c })),
});

describe('screenConfig: carátulas canción a canción', () => {
  test('covers[i] es la carátula de songs[i]; la que falta, vacía (el cliente pone el vinilo solo en esa)', () => {
    const c = screenConfig(base({ musicStyles: { [DEFAULT_STYLE]: style(['https://c/0.jpg', null, 'https://c/2.jpg', undefined]) } }), {}, SCENES);
    expect(c.songs.map((s) => s.song)).toEqual(['S0', 'S1', 'S2', 'S3']);
    expect(c.assets.covers).toEqual(['https://c/0.jpg', '', 'https://c/2.jpg', '']);
    expect(c.assets.covers).toHaveLength(c.songs.length);
  });
  test('si falta solo una, las demás no se pierden', () => {
    const urls = ['https://c/a', 'https://c/b', null, 'https://c/d', 'https://c/e', 'https://c/f'];
    const c = screenConfig(base({ musicStyles: { [DEFAULT_STYLE]: style(urls) } }), {}, SCENES);
    expect(c.assets.covers.filter(Boolean)).toHaveLength(5);
    c.songs.forEach((_, i) => expect(c.assets.covers[i]).toBe(urls[i] ?? ''));
  });
  test('ninguna carátula resuelta: todas vacías, alineadas', () => {
    const c = screenConfig(base({ musicStyles: { [DEFAULT_STYLE]: style([null, null, null]) } }), {}, SCENES);
    expect(c.assets.covers).toEqual(['', '', '']);
  });
  test('el estilo del local elige canciones y carátulas; uno desconocido cae al de por defecto', () => {
    const musicStyles = { [DEFAULT_STYLE]: style(['https://c/def', null]), rock: style([null, 'https://c/rock'], 'Rock') };
    expect(screenConfig(base({ musicStyles }), { musicStyle: 'rock' }, SCENES).assets.covers).toEqual(['', 'https://c/rock']);
    expect(screenConfig(base({ musicStyles }), { musicStyle: 'no-existe' }, SCENES).assets.covers).toEqual(['https://c/def', '']);
    expect(screenConfig(base({ musicStyles }), { musicStyle: null }, SCENES).assets.covers).toEqual(['https://c/def', '']);
  });
  test('sin el estilo por defecto, el primero que haya', () => {
    const c = screenConfig(base({ musicStyles: { otro: style(['https://c/x']) } }), { musicStyle: 'nada' }, SCENES);
    expect(c.assets.covers).toEqual(['https://c/x']);
  });
  test('canciones sin carátula resuelta (music.ts): se usan las carátulas sueltas de las props', () => {
    const c = screenConfig(base({ covers: ['https://c/1', 'https://c/2'] }), {}, SCENES);
    expect(c.songs).toEqual(MUSIC_STYLES[DEFAULT_STYLE].songs.map(({ song, artist }) => ({ song, artist })));
    expect(c.assets.covers).toEqual(['https://c/1', 'https://c/2']);
  });
  test('musicStyles vacío (válido según el schema) no rompe: caen las canciones de music.ts', () => {
    expect(liveScreenSchema.shape.musicStyles.safeParse({}).success).toBe(true);
    const c = screenConfig(base({ musicStyles: {} }), {}, SCENES);
    expect(c.songs).toEqual(MUSIC_STYLES[DEFAULT_STYLE].songs.map(({ song, artist }) => ({ song, artist })));
  });
});

describe('screenConfig: resto de la configuración', () => {
  test('nombre del local en mayúsculas y como mucho 40 caracteres', () => {
    expect(screenConfig(base({ venueName: 'sala ñandú' }), {}, SCENES).assets.venueName).toBe('SALA ÑANDÚ');
    expect(screenConfig(base({ venueName: 'x'.repeat(60) }), {}, SCENES).assets.venueName).toHaveLength(40);
  });
  test('fotos propias del cliente mandan (sin huecos); si no tiene, las de ejemplo', () => {
    const own = screenConfig(base(), { photos: ['', 'https://own/1'] }, SCENES);
    expect(own.assets.photos).toEqual(['https://own/1']);
    expect(own.ownPhoto).toBe('https://own/1');
    const none = screenConfig(base(), { photos: [''] }, SCENES);
    expect(none.assets.photos).toEqual(['https://p/1.webp']);
    expect(none.ownPhoto).toBeNull();
  });
  test('vídeo propio o el de ejemplo; logo; escenas normalizadas', () => {
    const p = base({ venueVideo: { webm: 'https://v.webm', mp4: 'https://v.mp4' } });
    expect(screenConfig(p, { video: 'https://own.mp4' }, SCENES).video).toEqual({ own: 'https://own.mp4' });
    expect(screenConfig(p, {}, SCENES).video).toEqual({ webm: 'https://v.webm', mp4: 'https://v.mp4' });
    const c = screenConfig(p, { logo: 'https://logo' }, SCENES);
    expect(c.assets.venueLogo).toBe('https://logo');
    expect(c.assets.qrImage).toBe('');
    expect(c.scenes).toEqual([{ scene: 'club.idle', video: false, text: '' }, { scene: 'club.song', video: false, text: 'Va por Marta' }, { scene: 'tp.idle', video: true, text: '' }]);
  });
});

describe('screenConfig con la pantalla real del espacio enjoy (tenant.json)', () => {
  const live = tenant.catalog.filter((m) => m.block_type === 'live-screen');
  test('hay al menos un módulo de pantalla y sus assets existen', () => {
    expect(live.length).toBeGreaterThan(0);
    for (const m of live) for (const r of assetRefs(m.props)) expect(existsSync(`${root}tenants/enjoy/assets/${r}`), r).toBe(true);
  });
  for (const m of live) {
    test(`${m.key}: valida y da una carátula por canción en cada estilo`, () => {
      const props = liveScreenSchema.parse(toUrl(m.props));
      const src: ScreenSource = { ...props, venueName: props.venueName.replace('{company}', 'Sala Prueba') };
      for (const musicStyle of [undefined, ...Object.keys(MUSIC_STYLES)]) {
        const c = screenConfig(src, { musicStyle }, props.scenes);
        expect(c.assets.venueName).toBe('SALA PRUEBA');
        expect(c.assets.photos).toEqual(props.photos);
        expect(c.assets.qrImage).toBe(props.qrImage ?? '');
        expect(c.scenes.map((s) => s.scene)).toEqual(props.scenes.map((s) => s.scene));
        expect(c.video).toEqual({ webm: props.venueVideo?.webm, mp4: props.venueVideo?.mp4 });
        expect(c.songs).toEqual(MUSIC_STYLES[musicStyle ?? DEFAULT_STYLE].songs.map(({ song, artist }) => ({ song, artist })));
        // Sin carátulas en el tenant.json: todas salen del vinilo del cliente (ninguna desalineada).
        expect(c.assets.covers.length).toBeLessThanOrEqual(c.songs.length);
      }
    });
    test(`${m.key}: con las carátulas que pone el alta (canción a canción, alguna sin encontrar)`, () => {
      const props = liveScreenSchema.parse(toUrl(m.props));
      // Como scripts/tenant-bootstrap.ts: cada canción con su cover (URL o null).
      const musicStyles = Object.fromEntries(Object.entries(MUSIC_STYLES).map(([k, s]) => [k, { label: s.label, songs: s.songs.map((x, i) => ({ ...x, cover: i === 2 ? null : `https://cdn.test/covers/${k}-${i}.jpg` })) }]));
      expect(liveScreenSchema.safeParse({ ...props, musicStyles }).success).toBe(true);
      for (const k of Object.keys(MUSIC_STYLES)) {
        const c = screenConfig({ ...props, musicStyles }, { musicStyle: k }, props.scenes);
        expect(c.assets.covers).toHaveLength(c.songs.length);
        c.songs.forEach((_, i) => expect(c.assets.covers[i]).toBe(i === 2 ? '' : `https://cdn.test/covers/${k}-${i}.jpg`));
      }
    });
  }
});
