import type { ClientMedia } from '~/lib/types';
import { DEFAULT_STYLE, MUSIC_STYLES, type MusicStyle } from './music';

/**
 * Lo que el cliente del motor necesita (assets, canciones del estilo, vídeo, móvil). Lo comparten la pantalla de la
 * propuesta (Component) y la miniatura de Aprende y la bienvenida (ScreenMini).
 */
export interface ScreenSource {
  venueName: string; djName: string; qrImage?: string; photos: string[]; covers: string[];
  phone?: { song?: string; photo?: string; message?: string };
  musicStyles?: Record<string, MusicStyle>;
  venueVideo?: { webm?: string; mp4?: string; poster?: string };
  autoplay: boolean;
}

export function screenConfig(p: ScreenSource, media: ClientMedia, scenes: Array<{ scene: string; video?: boolean; text?: string }>) {
  const ownPhotos = (media.photos ?? []).filter(Boolean);
  // Canciones del estilo de SU local (Personalizar → estilo musical).
  const styles = p.musicStyles ?? MUSIC_STYLES;
  const style = styles[media.musicStyle ?? ''] ?? styles[DEFAULT_STYLE] ?? Object.values(styles)[0];
  const songs = style.songs;
  // Carátula canción a canción (la que no tenga, vinilo de color en el cliente): antes, si faltaba una, se perdían todas.
  const resolved = songs.some((x) => 'cover' in x);
  return {
    assets: {
      venueName: p.venueName.toUpperCase().slice(0, 40), venueLogo: media.logo ?? '', djName: p.djName, showEnjoyLogo: true, qrImage: p.qrImage ?? '',
      photos: ownPhotos.length ? ownPhotos : p.photos, covers: resolved ? songs.map((x) => x.cover ?? '') : p.covers, avatars: [], videos: [] as string[],
    },
    songs: songs.map((x) => ({ song: x.song, artist: x.artist })),
    // Sus visuales: su vídeo si lo han subido; si no, uno de ejemplo de un local (el navegador elige el formato).
    video: media.video ? { own: media.video } : { webm: p.venueVideo?.webm, mp4: p.venueVideo?.mp4 },
    phone: p.phone ?? {}, ownPhoto: ownPhotos[0] ?? null, autoplay: p.autoplay,
    scenes: scenes.map((s) => ({ scene: s.scene, video: !!s.video, text: s.text ?? '' })),
  };
}
