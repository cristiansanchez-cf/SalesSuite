/**
 * Personalizar la propuesta (docs/PERSONALIZE.md): quién sube, qué tipos y tamaños, y que solo se adjunten URLs de la
 * carpeta de ESTA propuesta (no de otra ni de otro espacio).
 */
import { describe, expect, test } from 'vitest';
import type { AdminDb, AssetStore } from './db';
import { createMediaService, MAX_PHOTOS } from './media';
import { AdminError } from './service';
import type { AdminSession, DossierRecord } from './types';
import type { ClientMedia } from '../types';

const T = '00000000-0000-4000-8000-000000000e01';
const OTHER_T = '00000000-0000-4000-8000-000000000a01';
const D = '00000000-0000-4000-8000-000000d05501';
const D2 = '00000000-0000-4000-8000-000000d05502';
const PREFIX = `https://cdn.example.test/storage/v1/object/public/tenant-assets/${T}/`;
const s: AdminSession = { userId: 'u1', email: 'rep@x.test', displayName: null, tenantId: T, role: 'rep' };

function env(o: { media?: ClientMedia; tenantId?: string; canEdit?: boolean; assets?: AssetStore | undefined } = {}) {
  const rows = new Map<string, { tenantId: string; clientMedia: ClientMedia }>([
    [D, { tenantId: o.tenantId ?? T, clientMedia: o.media ?? {} }],
    [D2, { tenantId: OTHER_T, clientMedia: {} }],
  ]);
  const signed: string[] = [];
  const db = {
    async getDossier(id: string) { const r = rows.get(id); return r ? ({ id, ...r } as unknown as DossierRecord) : null; },
    async updateDossier(id: string, p: { clientMedia: ClientMedia }) { rows.get(id)!.clientMedia = p.clientMedia; return true; },
  } as unknown as AdminDb;
  const assets: AssetStore = 'assets' in o ? o.assets! : {
    async upload() { throw new Error('x'); },
    async signUpload(t, path, type) { signed.push(`${t}|${path}|${type}`); return { uploadUrl: `https://up.test/${path}`, publicUrl: `${PREFIX}${path}` }; },
    publicPrefix: () => PREFIX,
  };
  return { svc: createMediaService(db, s, assets, () => o.canEdit ?? true), rows, signed };
}
async function rejects(p: Promise<unknown>, status: number) {
  const e = await p.then(() => null, (err) => err);
  expect(e, `esperaba AdminError ${status}, llegó ${e}`).toBeInstanceOf(AdminError);
  expect((e as AdminError).status).toBe(status);
}

describe('subir archivos del cliente', () => {
  test('firma la subida en la carpeta de la propuesta, dentro del espacio', async () => {
    const { svc, signed } = env();
    const r = await svc.sign(D, { kind: 'logo', type: 'image/svg+xml', size: 1000 });
    expect(r.publicUrl.startsWith(`${PREFIX}dossiers/${D}/logo-`)).toBe(true);
    expect(signed[0]).toMatch(new RegExp(`^${T}\\|dossiers/${D}/logo-[a-z0-9]+\\|image/svg\\+xml$`));
  });

  test('tipo y tamaño por clase de archivo (el SVG solo como logo; vídeo MP4/WebM hasta 30 MB)', async () => {
    const { svc } = env();
    await rejects(svc.sign(D, { kind: 'photo', type: 'image/svg+xml', size: 10 }), 422);
    await rejects(svc.sign(D, { kind: 'video', type: 'video/quicktime', size: 10 }), 422);
    await rejects(svc.sign(D, { kind: 'photo', type: 'image/png', size: 0 }), 422);
    await rejects(svc.sign(D, { kind: 'photo', type: 'image/png', size: 'mucho' }), 422);
    await rejects(svc.sign(D, { kind: 'photo', type: 'image/png', size: 8 * 1024 * 1024 + 1 }), 422);
    await rejects(svc.sign(D, { kind: 'video', type: 'video/mp4', size: 30 * 1024 * 1024 + 1 }), 422);
    await rejects(svc.sign(D, { kind: 'exe', type: 'application/x-msdownload', size: 10 }), 422);
    await expect(svc.sign(D, { kind: 'video', type: 'video/webm', size: 30 * 1024 * 1024 })).resolves.toBeTruthy();
  });

  test(`como mucho ${MAX_PHOTOS} fotos`, async () => {
    const { svc } = env({ media: { photos: Array.from({ length: MAX_PHOTOS }, (_, i) => `${PREFIX}dossiers/${D}/p${i}`) } });
    await rejects(svc.sign(D, { kind: 'photo', type: 'image/jpeg', size: 10 }), 422);
  });

  test('propuesta de otro espacio: 404; sin permiso para editarla: 403; sin almacenamiento: 503', async () => {
    await rejects(env().svc.sign(D2, { kind: 'logo', type: 'image/png', size: 10 }), 404);
    await rejects(env({ tenantId: OTHER_T }).svc.attach(D, { kind: 'logo', url: `${PREFIX}dossiers/${D}/logo.png` }), 404);
    await rejects(env({ canEdit: false }).svc.sign(D, { kind: 'logo', type: 'image/png', size: 10 }), 403);
    await rejects(env({ canEdit: false }).svc.remove(D, 'x'), 403);
    await rejects(env({ assets: undefined }).svc.sign(D, { kind: 'logo', type: 'image/png', size: 10 }), 503);
  });
});

describe('adjuntar: solo URLs de esta propuesta', () => {
  test('la suya se adjunta; las fotos se acumulan (las últimas)', async () => {
    const { svc, rows } = env();
    await svc.attach(D, { kind: 'logo', url: `${PREFIX}dossiers/${D}/logo-1.png` });
    for (let i = 0; i < MAX_PHOTOS + 2; i++) await svc.attach(D, { kind: 'photo', url: `${PREFIX}dossiers/${D}/p${i}.jpg` });
    const m = rows.get(D)!.clientMedia;
    expect(m.logo).toBe(`${PREFIX}dossiers/${D}/logo-1.png`);
    expect(m.photos).toHaveLength(MAX_PHOTOS);
    expect(m.photos![0]).toBe(`${PREFIX}dossiers/${D}/p2.jpg`);
  });

  test('de otra propuesta, de otro espacio, de fuera o con comillas: 422', async () => {
    const { svc, rows } = env();
    const bad = [
      `${PREFIX}dossiers/${D2}/logo.png`,
      `https://cdn.example.test/storage/v1/object/public/tenant-assets/${OTHER_T}/dossiers/${D}/logo.png`,
      'https://evil.example/logo.png',
      'javascript:alert(1)',
      `${PREFIX}dossiers/${D}/logo.png" onerror="alert(1)`,
      `${PREFIX}dossiers/${D}/logo .png`,
      '',
    ];
    for (const url of bad) await rejects(svc.attach(D, { kind: 'logo', url }), 422);
    expect(rows.get(D)!.clientMedia).toEqual({});
  });

  test('sin prefijo público configurado no se adjunta nada', async () => {
    const assets: AssetStore = { async upload() { throw new Error('x'); } };
    await rejects(env({ assets }).svc.attach(D, { kind: 'logo', url: `${PREFIX}dossiers/${D}/logo.png` }), 422);
  });

  // BUG (src/lib/admin/media.ts:50, attach): la comprobación es un `startsWith` sobre el texto, así que una URL con «..»
  // pasa por ser «de esta propuesta» y, una vez normalizada por el navegador o Storage, apunta a la carpeta de otra
  // propuesta u otro espacio. El bucket es público (impacto bajo: se ve un archivo ajeno), pero rompe la regla «solo
  // URLs de la carpeta de ESTA propuesta». Arreglo: normalizar con new URL() y comprobar el pathname resultante, o
  // rechazar «..» y «%2e». Quitar `.fails` cuando esté arreglado.
  test('una URL que sale de la carpeta con «..» no cuela', async () => {
    const { svc } = env();
    await rejects(svc.attach(D, { kind: 'logo', url: `${PREFIX}dossiers/${D}/../../../${OTHER_T}/dossiers/x/logo.png` }), 422);
  });

  test('quitar: solo lo que coincide; opciones validadas', async () => {
    const own = `${PREFIX}dossiers/${D}/p.jpg`;
    const { svc, rows } = env({ media: { logo: own, photos: [own, `${PREFIX}dossiers/${D}/q.jpg`] } });
    await svc.remove(D, own);
    expect(rows.get(D)!.clientMedia).toMatchObject({ logo: null, photos: [`${PREFIX}dossiers/${D}/q.jpg`] });
    await rejects(svc.options(D, { musicStyle: '<script>' }), 422);
    await rejects(svc.options(D, { layout: 'grid' }), 422);
    const m = await svc.options(D, { features: { songs: false, photos: 'sí' }, musicStyle: 'reggaeton', layout: 'scroll' });
    expect(m).toMatchObject({ features: { songs: false, photos: true, messages: true, album: true }, musicStyle: 'reggaeton', layout: 'scroll' });
  });
});
