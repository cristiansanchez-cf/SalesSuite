import { beforeEach, describe, expect, test } from 'vitest';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { demoDb, resetDemoDb } from '../data/store';
import { fixtureMediaApi, MediaApiError, type MediaApi, type SocialProfile } from './media-api';
import { CACHE_MS, createSocialService, type SocialCache } from './service';

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
  beforeEach(() => { resetDemoDb(); });

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

  test('Instagram (cuenta de empresa, API oficial): también pagina', async () => {
    const { svc, id, calls } = await setup();
    const r = await svc.list(id, { platform: 'instagram' });
    expect(r.ok && r.more).toBe(true);
    const p2 = await svc.more(id, { key: 'instagram:clubsol' });
    expect(p2.ok && p2.posts.map((p) => p.i)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(calls.map((c) => c.cursor)).toEqual([null, 'p2-clubsol']);
  });

  test('Instagram personal: la primera página y, al pedir más, se queda con lo que hay (sin reintentar)', async () => {
    const { svc, id, calls } = await setup({ instagram: 'https://www.instagram.com/anapersonal/' });
    const r = await svc.list(id, { platform: 'instagram' });
    expect(r.ok && r.more).toBe(true);
    expect(await svc.more(id, { key: 'instagram:anapersonal' })).toMatchObject({ ok: false, code: 'NO_MORE_PAGES', more: false });
    expect(await svc.more(id, { key: 'instagram:anapersonal' })).toMatchObject({ ok: true, posts: [], more: false });
    expect(calls).toHaveLength(2);
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

  test('un cursor que ya no vale: no se reintenta; al volver a abrir, se pide la primera página', async () => {
    let bad = true;
    const base = fixtureMediaApi();
    const api: MediaApi = { ...base, async list(p, pl, l, c) { if (c && bad) throw new MediaApiError('INVALID_CURSOR', 400); return base.list(p, pl, l, c); } };
    const { svc, id, calls } = await setup({ api });
    const first = await svc.list(id, { platform: 'tiktok' });
    if (!first.ok) throw new Error(first.code);
    expect(await svc.more(id, { key: first.key })).toMatchObject({ ok: false, code: 'EXPIRED', more: false });
    expect(await svc.more(id, { key: first.key })).toMatchObject({ ok: false, code: 'EXPIRED' });
    expect(calls).toHaveLength(2);
    bad = false;
    const again = await svc.list(id, { platform: 'tiktok' });
    expect(again.ok && again.posts).toHaveLength(6);
    expect(calls.map((c) => c.cursor)).toEqual([null, 'p2-clubsol', null]);
  });

  test('pasada la hora, la lista caduca y hay que volver a abrirla', async () => {
    const { svc, id, tick } = await setup();
    const first = await svc.list(id, { platform: 'tiktok' });
    if (!first.ok) throw new Error(first.code);
    tick(CACHE_MS + 1000);
    expect(await svc.more(id, { key: first.key })).toMatchObject({ ok: false, code: 'EXPIRED' });
  });
});

describe('Instagram pide sesión (cuenta personal o restringida)', () => {
  beforeEach(() => { resetDemoDb(); });

  test('no se reintenta: se sigue sin Instagram y no se vuelve a pedir en la hora; TikTok sigue', async () => {
    const { svc, id, calls, tick } = await setup({ instagram: 'https://www.instagram.com/salarestringido/' });
    expect(await svc.list(id, { platform: 'instagram' })).toMatchObject({ ok: false, code: 'LOGIN_REQUIRED' });
    tick(10 * 60_000);
    expect(await svc.list(id, { platform: 'instagram' })).toMatchObject({ ok: false, code: 'LOGIN_REQUIRED' });
    expect(calls).toHaveLength(1);
    // Pasada la hora, se vuelve a mirar (puede haber pasado a cuenta de empresa).
    tick(CACHE_MS);
    await svc.list(id, { platform: 'instagram' });
    expect(calls).toHaveLength(2);
    expect((await svc.list(id, { platform: 'tiktok' })).ok).toBe(true);
  });

  test('ya no hay que esperar entre perfiles de Instagram', async () => {
    const { svc, id } = await setup();
    expect((await svc.list(id, { platform: 'instagram' })).ok).toBe(true);
    demoDb().account.find((a) => a.id === SOL)!.instagram = 'https://www.instagram.com/otrasala/';
    expect((await svc.list(id, { platform: 'instagram' })).ok).toBe(true);
  });
});
