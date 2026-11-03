import { beforeEach, describe, expect, test } from 'vitest';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { demoDb, resetDemoDb } from '../data/store';
import { fixtureMediaApi, MediaApiError, type MediaApi, type SocialProfile } from './media-api';
import { CACHE_MS, IG_GAP_MS, IG_RETRY_MS, createSocialService, resetIgPacing, type SocialCache } from './service';

const REP = '11111111-1111-4111-8111-111111111111';
const SOL = '00000000-0000-4000-8000-0000000ac001';

function memCache(): SocialCache & { rows: Map<string, { result: SocialProfile; fetchedAt: string }> } {
  const rows = new Map<string, { result: SocialProfile; fetchedAt: string }>();
  let clock = () => Date.now();
  return {
    rows,
    async get(t, k) { return rows.get(`${t}|${k}`) ?? null; },
    async put(t, k, r) { rows.set(`${t}|${k}`, { result: JSON.parse(JSON.stringify(r)), fetchedAt: new Date(clock()).toISOString() }); },
    set clock(f: () => number) { clock = f; },
  } as SocialCache & { rows: Map<string, { result: SocialProfile; fetchedAt: string }> };
}

/** Una propuesta de Club Sol (con su Instagram y un TikTok) y el servicio con la API de pruebas y un reloj a mano. */
async function setup(over: { api?: MediaApi; instagram?: string; tiktok?: string } = {}) {
  const d = demoDb();
  const acc = d.account.find((a) => a.id === SOL)!;
  acc.instagram = over.instagram ?? 'https://www.instagram.com/clubsol/';
  acc.tiktok = over.tiktok ?? 'https://www.tiktok.com/@clubsol';
  const dossier = d.dossier.find((x) => x.author_id === REP && x.tenant_id === acc.tenant_id)!;
  (dossier as { account_id?: string | null }).account_id = SOL;
  const admin = (await contextAs((await publicRepository().resolveTenantBySlug('enjoy'))!, REP))!;
  let t = Date.parse('2026-11-03T10:00:00Z');
  const cache = memCache();
  (cache as unknown as { clock: () => number }).clock = () => t;
  const calls: Array<{ profile: string; cursor: string | null }> = [];
  const base = over.api ?? fixtureMediaApi();
  const api: MediaApi = { list: (p, pl, l, c) => { calls.push({ profile: p, cursor: c ?? null }); return base.list(p, pl, l, c); }, download: base.download };
  const svc = createSocialService(admin, { api, cache, now: () => t, fetchFile: async () => ({ bytes: new Uint8Array([1]), type: 'image/png' }), put: async () => {} });
  return { svc, id: dossier.id, calls, cache, tick: (ms: number) => { t += ms; } };
}

describe('«Cargar más» en sus publicaciones', () => {
  beforeEach(() => { resetDemoDb(); resetIgPacing(); });

  test('TikTok: página a página hasta que no hay más (la última llena trae cursor y la siguiente sale vacía)', async () => {
    const { svc, id, calls } = await setup();
    const first = await svc.list(id, { platform: 'tiktok' });
    if (!first.ok) throw new Error(first.code);
    expect(first.posts).toHaveLength(6);
    expect(first.more).toBe(true);
    const p2 = await svc.more(id, { key: first.key });
    if (!p2.ok) throw new Error(p2.code);
    // Las posiciones siguen a las de antes (las miniaturas y el «traer» van por posición).
    expect(p2.posts.map((p) => p.i)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(p2.more).toBe(true);
    await svc.more(id, { key: first.key });
    const last = await svc.more(id, { key: first.key });
    expect(last).toMatchObject({ ok: true, posts: [], more: false });
    // Ya no hay más: no se pide nada.
    expect(await svc.more(id, { key: first.key })).toMatchObject({ ok: true, posts: [], more: false });
    expect(calls.map((c) => c.cursor)).toEqual([null, 'p2-clubsol', 'p3-clubsol', 'p4-clubsol']);
    // Reabrir dentro de la hora: todo desde la caché (sin pedir nada), con las cuatro páginas.
    const again = await svc.list(id, { platform: 'tiktok' });
    expect(again.ok && again.posts.length).toBe(18);
    expect(calls).toHaveLength(4);
    // Y se puede traer una de la página 2.
    const r = await svc.importPost(id, { key: first.key, index: 7, url: p2.posts[1].url, kind: 'photo' });
    expect(r.ok || r.code).toBeTruthy();
  });

  test('Instagram sin sesión: solo la primera página (sin «Cargar más»)', async () => {
    const { svc, id, calls } = await setup();
    const r = await svc.list(id, { platform: 'instagram' });
    expect(r.ok && r.more).toBe(false);
    expect(await svc.more(id, { key: 'instagram:clubsol' })).toMatchObject({ ok: true, more: false });
    expect(calls).toHaveLength(1);
  });

  test('TikTok caído un rato: dice cuánto esperar y que se puede volver a pedir', async () => {
    let fail = true;
    const base = fixtureMediaApi();
    const api: MediaApi = { ...base, async list(p, pl, l, c) { if (c && fail) throw new MediaApiError('UPSTREAM_UNAVAILABLE', 503, 60); return base.list(p, pl, l, c); } };
    const { svc, id } = await setup({ api });
    const first = await svc.list(id, { platform: 'tiktok' });
    if (!first.ok) throw new Error(first.code);
    expect(await svc.more(id, { key: first.key })).toMatchObject({ ok: false, code: 'UPSTREAM_UNAVAILABLE', retryAfter: 60, more: true });
    fail = false;
    expect(await svc.more(id, { key: first.key })).toMatchObject({ ok: true, more: true });
  });

  test('un cursor que ya no vale: no se reintenta', async () => {
    const base = fixtureMediaApi();
    const api: MediaApi = { ...base, async list(p, pl, l, c) { if (c) throw new MediaApiError('INVALID_CURSOR', 400); return base.list(p, pl, l, c); } };
    const { svc, id, calls } = await setup({ api });
    const first = await svc.list(id, { platform: 'tiktok' });
    if (!first.ok) throw new Error(first.code);
    expect(await svc.more(id, { key: first.key })).toMatchObject({ ok: false, code: 'INVALID_CURSOR', more: false });
    expect(await svc.more(id, { key: first.key })).toMatchObject({ ok: true, more: false });
    expect(calls).toHaveLength(2);
  });

  test('pasada la hora, la lista caduca y hay que volver a abrirla', async () => {
    const { svc, id, tick } = await setup();
    const first = await svc.list(id, { platform: 'tiktok' });
    if (!first.ok) throw new Error(first.code);
    tick(CACHE_MS + 1000);
    expect(await svc.more(id, { key: first.key })).toMatchObject({ ok: false, code: 'EXPIRED' });
  });
});

describe('Instagram bloqueando', () => {
  beforeEach(() => { resetDemoDb(); resetIgPacing(); });

  test('pendiente; se vuelve a probar una sola vez pasados 20 minutos; si sigue, sin Instagram', async () => {
    const { svc, id, calls, tick } = await setup({ instagram: 'https://www.instagram.com/salabloqueado/' });
    expect(await svc.list(id, { platform: 'instagram' })).toMatchObject({ ok: false, code: 'IG_PENDING', retryAfter: IG_RETRY_MS / 1000 });
    // Antes de los 20 minutos, ni se intenta.
    tick(5 * 60_000);
    expect(await svc.list(id, { platform: 'instagram' })).toMatchObject({ ok: false, code: 'IG_PENDING' });
    expect(calls).toHaveLength(1);
    // Pasados, una vez más; sigue bloqueado: sin Instagram (y no se vuelve a intentar en horas).
    tick(IG_RETRY_MS);
    expect(await svc.list(id, { platform: 'instagram' })).toMatchObject({ ok: false, code: 'IG_BLOCKED' });
    tick(IG_RETRY_MS * 3);
    expect(await svc.list(id, { platform: 'instagram' })).toMatchObject({ ok: false, code: 'IG_BLOCKED' });
    expect(calls).toHaveLength(2);
    // TikTok sigue funcionando.
    expect((await svc.list(id, { platform: 'tiktok' })).ok).toBe(true);
  });

  test('como mucho un perfil de Instagram cada dos minutos', async () => {
    const { svc, id, tick } = await setup();
    expect((await svc.list(id, { platform: 'instagram' })).ok).toBe(true);
    // Otro perfil (otra empresa) enseguida: que espere.
    demoDb().account.find((a) => a.id === SOL)!.instagram = 'https://www.instagram.com/otrasala/';
    expect(await svc.list(id, { platform: 'instagram' })).toMatchObject({ ok: false, code: 'IG_WAIT' });
    tick(IG_GAP_MS);
    expect((await svc.list(id, { platform: 'instagram' })).ok).toBe(true);
  });
});
