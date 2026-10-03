/**
 * Personalizar la propuesta (docs/PERSONALIZE.md): logo, fotos y vídeo del cliente.
 * 1) sign: comprueba que puedes editar la propuesta, el tipo y el tamaño → URL para subir directo a Storage.
 * 2) el navegador sube el archivo (sin pasar por el servidor: los vídeos no caben en una petición de Vercel).
 * 3) attach: guarda la URL pública en la propuesta (solo URLs de la carpeta de ESTA propuesta).
 */
import type { AdminDb, AssetStore } from './db';
import { AdminError } from './service';
import type { AdminSession, DossierRecord } from './types';
import type { ClientMedia } from '../types';

export const MEDIA_KINDS = ['logo', 'photo', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
const TYPES: Record<MediaKind, string[]> = {
  logo: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  photo: ['image/png', 'image/jpeg', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
};
const MAX: Record<MediaKind, number> = { logo: 5 * 1024 * 1024, photo: 8 * 1024 * 1024, video: 30 * 1024 * 1024 };
export const MAX_PHOTOS = 8;

export function createMediaService(db: AdminDb, s: AdminSession, assets: AssetStore | undefined, canEdit: (d: DossierRecord) => boolean) {
  async function editable(id: string) {
    const d = await db.getDossier(id);
    if (!d || d.tenantId !== s.tenantId) throw new AdminError(404, 'Propuesta no encontrada');
    if (!canEdit(d)) throw new AdminError(403, 'Solo quien hizo la propuesta (o un responsable) la personaliza');
    return d;
  }
  const kindOf = (k: unknown): MediaKind => {
    if (!MEDIA_KINDS.includes(k as MediaKind)) throw new AdminError(422, 'Tipo de archivo no válido');
    return k as MediaKind;
  };

  async function sign(id: string, input: { kind: unknown; type: unknown; size: unknown }) {
    const d = await editable(id);
    const kind = kindOf(input.kind);
    const type = String(input.type ?? '');
    const size = Number(input.size ?? 0);
    if (!TYPES[kind].includes(type)) throw new AdminError(422, kind === 'video' ? 'El vídeo tiene que ser MP4 o WebM' : 'La imagen tiene que ser PNG, JPG o WebP');
    if (!(size > 0) || size > MAX[kind]) throw new AdminError(422, `Máximo ${MAX[kind] / 1024 / 1024} MB`);
    if (kind === 'photo' && (d.clientMedia?.photos?.length ?? 0) >= MAX_PHOTOS) throw new AdminError(422, `Como mucho ${MAX_PHOTOS} fotos`);
    if (!assets?.signUpload) throw new AdminError(503, 'La subida de archivos no está configurada');
    return assets.signUpload(s.tenantId, `dossiers/${id}/${kind}-${Date.now().toString(36)}`, type);
  }

  async function attach(id: string, input: { kind: unknown; url: unknown }) {
    const d = await editable(id);
    const kind = kindOf(input.kind);
    const url = String(input.url ?? '');
    const prefix = assets?.publicPrefix?.(s.tenantId) ?? '';
    const own = prefix === '/demo-media/' ? url.startsWith(prefix) : url.startsWith(`${prefix}dossiers/${id}/`);
    if (!prefix || !own || /[\s"'<>]/.test(url)) throw new AdminError(422, 'Archivo no válido');
    const m: ClientMedia = { ...(d.clientMedia ?? {}) };
    if (kind === 'logo') m.logo = url;
    if (kind === 'video') m.video = url;
    if (kind === 'photo') m.photos = [...(m.photos ?? []), url].slice(-MAX_PHOTOS);
    await db.updateDossier(id, { clientMedia: m });
    return m;
  }

  async function remove(id: string, url: string) {
    const d = await editable(id);
    const m: ClientMedia = { ...(d.clientMedia ?? {}) };
    if (m.logo === url) m.logo = null;
    if (m.video === url) m.video = null;
    m.photos = (m.photos ?? []).filter((x) => x !== url);
    await db.updateDossier(id, { clientMedia: m });
    return m;
  }

  /** Qué tiene el cliente (canciones, fotos, mensajes, álbum) y el estilo musical de los ejemplos. */
  async function options(id: string, input: { features?: unknown; musicStyle?: unknown }) {
    const d = await editable(id);
    const m: ClientMedia = { ...(d.clientMedia ?? {}) };
    if (input.features && typeof input.features === 'object') {
      const f = input.features as Record<string, unknown>;
      m.features = Object.fromEntries((['songs', 'photos', 'messages', 'album'] as const).map((k) => [k, f[k] !== false])) as ClientMedia['features'];
    }
    if (input.musicStyle !== undefined) {
      const st = String(input.musicStyle ?? '');
      if (st && !/^[a-z0-9-]{1,40}$/.test(st)) throw new AdminError(422, 'Estilo no válido');
      m.musicStyle = st || null;
    }
    await db.updateDossier(id, { clientMedia: m });
    return m;
  }

  return { sign, attach, remove, options };
}
