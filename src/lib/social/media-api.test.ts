import { describe, expect, test } from 'vitest';
import { fixtureMediaApi, httpMediaApi, MediaApiError, parseProfile, pickPosts, profileRef, rank, type SocialPost } from './media-api';
import { postLink, socialSources } from './service';
import { fetchFile, THUMB_HOST } from './server';

const post = (over: Partial<SocialPost>): SocialPost => ({ url: 'https://www.instagram.com/p/x/', shortcode: 'x', type: 'image', itemCount: 1, takenAt: '2026-10-01T00:00:00Z', pinned: false, caption: null, thumbnail: null, likes: 0, comments: 0, views: null, ...over });

describe('elegir publicaciones', () => {
  test('fijadas primero, luego engagement (reproducciones en vídeo), luego la más reciente', () => {
    const r = rank([
      post({ url: 'a', likes: 100 }), post({ url: 'b', likes: 5, pinned: true }), post({ url: 'c', type: 'video', views: 9000, likes: 1 }),
      post({ url: 'd', likes: 100, takenAt: '2026-10-05T00:00:00Z' }),
    ]);
    expect(r.map((p) => p.url)).toEqual(['b', 'c', 'd', 'a']);
  });
  test('respeta el tipo: fotos de image y carousel, vídeos de video; y cuántas', () => {
    const ps = [post({ url: 'v', type: 'video', views: 10 }), post({ url: 'c', type: 'carousel', likes: 50 }), post({ url: 'i', likes: 10 }), post({ url: 'i2', likes: 1 })];
    const p = pickPosts(ps, { photos: 2, videos: 1 });
    expect(p.photos.map((x) => x.url)).toEqual(['c', 'i']);
    expect(p.videos.map((x) => x.url)).toEqual(['v']);
    expect(pickPosts(ps, { photos: 0, videos: 0 })).toEqual({ photos: [], videos: [] });
  });
  test('nulos de TikTok (pinned, likes, views) no rompen el orden', () => {
    expect(() => rank([post({ pinned: null, likes: null, comments: null }), post({ type: 'video', views: null })])).not.toThrow();
  });
});

describe('el enlace del CRM', () => {
  test('enlace, @usuario o usuario; publicaciones sueltas no valen', () => {
    expect(profileRef('https://www.instagram.com/ClubSol/?hl=es', 'instagram')).toEqual({ profile: 'https://www.instagram.com/clubsol/', platform: null, key: 'instagram:clubsol' });
    expect(profileRef('instagram.com/clubsol', 'instagram')?.key).toBe('instagram:clubsol');
    expect(profileRef('https://www.tiktok.com/@sala.x', 'tiktok')).toMatchObject({ profile: 'https://www.tiktok.com/@sala.x', key: 'tiktok:sala.x' });
    expect(profileRef('@clubsol', 'instagram')).toEqual({ profile: 'clubsol', platform: 'instagram', key: 'instagram:clubsol' });
    expect(profileRef('https://www.instagram.com/p/ABC/', 'instagram')).toBeNull();
    expect(profileRef('https://otra.web/clubsol', 'instagram')).toBeNull();
    expect(profileRef('', 'tiktok')).toBeNull();
    expect(socialSources({ instagram: '@clubsol', tiktok: null })).toEqual([{ platform: 'instagram', key: 'instagram:clubsol', handle: 'clubsol' }]);
  });
});

describe('cliente de la API', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  test('manda la clave en X-API-Key (sin Origin ni Authorization) y entiende la respuesta', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const api = httpMediaApi({ base: 'https://api.test/', key: 'k', gapMs: 0, fetch: async (url, init) => { calls.push({ url: String(url), init: init! }); return ok({ platform: 'instagram', username: 'marca', followers: 3, posts: [{ url: 'https://www.instagram.com/reel/A/', type: 'video', taken_at: 'x', pinned: false, views: 9 }, { url: 'nope', type: 'image' }] }); } });
    const r = await api.list('https://www.instagram.com/marca/', null, 50);
    expect(calls[0].url).toBe('https://api.test/api/media-list');
    const h = calls[0].init.headers as Record<string, string>;
    expect(h['x-api-key']).toBe('k');
    expect(Object.keys(h).map((x) => x.toLowerCase())).not.toContain('authorization');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ profile: 'https://www.instagram.com/marca/', limit: 12 });
    expect(r.posts).toHaveLength(1);
    expect(r.posts[0]).toMatchObject({ type: 'video', views: 9, pinned: false });
  });
  test('errores con su código; 500 se reintenta una vez; perfil privado no', async () => {
    let n = 0;
    const flaky = httpMediaApi({ base: 'https://api.test', key: 'k', gapMs: 0, fetch: async () => (++n === 1 ? new Response('{"code":"LIST_FAILED"}', { status: 500 }) : ok({ platform: 'tiktok', username: 'x', posts: [] })) });
    await expect(flaky.list('x', 'tiktok')).resolves.toMatchObject({ platform: 'tiktok' });
    expect(n).toBe(2);
    let m = 0;
    const priv = httpMediaApi({ base: 'https://api.test', key: 'k', gapMs: 0, fetch: async () => { m++; return new Response('{"error":"privado","code":"PROFILE_PRIVATE"}', { status: 403 }); } });
    await expect(priv.list('x')).rejects.toMatchObject({ code: 'PROFILE_PRIVATE' });
    expect(m).toBe(1);
  }, 10_000);
  test('páginas: manda el cursor; sin reintento si Instagram pide sesión, TikTok está caído o la clave no vale', async () => {
    const bodies: unknown[] = [];
    const paged = httpMediaApi({ base: 'https://api.test', key: 'k', gapMs: 0, fetch: async (_u, init) => { bodies.push(JSON.parse(String(init!.body))); return ok({ platform: 'tiktok', username: 'x', posts: [], next_cursor: 'c2' }); } });
    expect((await paged.list('x', 'tiktok', 12, 'c1')).nextCursor).toBe('c2');
    expect(bodies[0]).toEqual({ profile: 'x', platform: 'tiktok', limit: 12, cursor: 'c1' });
    for (const [status, body, code] of [
      [422, '{"code":"LOGIN_REQUIRED","message":"Instagram está bloqueando consultas anónimas"}', 'LOGIN_REQUIRED'],
      [503, '{"code":"UPSTREAM_UNAVAILABLE"}', 'UPSTREAM_UNAVAILABLE'],
      [400, '{"code":"INVALID_CURSOR"}', 'INVALID_CURSOR'],
      [401, '{}', 'INVALID_API_KEY'],
    ] as const) {
      let n = 0;
      const api = httpMediaApi({ base: 'https://api.test', key: 'k', gapMs: 0, fetch: async () => { n++; return new Response(body, { status, headers: { 'retry-after': '60' } }); } });
      const e = await api.list('x', 'tiktok', 12, 'c').catch((x) => x);
      expect(e).toBeInstanceOf(MediaApiError);
      expect([e.code, n]).toEqual([code, 1]);
      if (code === 'UPSTREAM_UNAVAILABLE') expect(e.retryAfter).toBe(60);
      if (code === 'LOGIN_REQUIRED') expect(e.detail).toContain('bloqueando');
    }
  });
  test('descargas de una en una, nunca en paralelo', async () => {
    let active = 0, max = 0;
    const api = httpMediaApi({ base: 'https://api.test', key: 'k', gapMs: 0, fetch: async () => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 20)); active--; return ok({ items: [{ name: 'a.jpg', type: 'image', size: 1, url: 'https://storage.googleapis.com/x' }] }); } });
    const out = await Promise.all([api.download('https://www.instagram.com/p/1/'), api.download('https://www.instagram.com/p/2/')]);
    expect(max).toBe(1);
    expect(out[0][0]).toMatchObject({ type: 'image', url: 'https://storage.googleapis.com/x' });
  });
  test('parseProfile tolera basura', () => {
    expect(parseProfile(null)).toEqual({ platform: 'instagram', username: '', fullName: null, followers: null, posts: [], nextCursor: null });
    expect(parseProfile({ posts: [], next_cursor: 'abc' }).nextCursor).toBe('abc');
  });
  test('la demo: perfil privado y publicación no disponible', async () => {
    const api = fixtureMediaApi();
    await expect(api.list('@perfilprivado', 'instagram')).rejects.toBeInstanceOf(MediaApiError);
    const r = await api.list('@clubsol', 'instagram');
    await expect(api.download(r.posts[3].url)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  });
});

describe('descarga del archivo', () => {
  test('solo de Storage de Google y con tope de tamaño', async () => {
    await expect(fetchFile('https://evil.test/a.jpg', 10)).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
    const big = async () => new Response(new Uint8Array(20), { status: 200 });
    await expect(fetchFile('https://storage.googleapis.com/b/a.jpg', 10, big as typeof fetch)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    const small = async () => new Response(new Uint8Array(5), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    await expect(fetchFile('https://storage.googleapis.com/b/a.jpg', 10, small as typeof fetch)).resolves.toMatchObject({ type: 'image/jpeg' });
  });
  test('miniaturas solo de los servidores de Instagram y TikTok', () => {
    expect(THUMB_HOST.test('https://scontent-mad1-1.cdninstagram.com/v/t51/x.jpg')).toBe(true);
    expect(THUMB_HOST.test('https://p16-sign-va.tiktokcdn.com/obj/x.jpeg')).toBe(true);
    expect(THUMB_HOST.test('https://evil.test/cdninstagram.com/x.jpg')).toBe(false);
    expect(THUMB_HOST.test('http://scontent.cdninstagram.com/x.jpg')).toBe(false);
  });
});

describe('enlace pegado', () => {
  test('publicaciones sueltas de Instagram y TikTok; perfiles y otras webs no', () => {
    expect(postLink('https://www.instagram.com/p/DQx1abcDEF/?igsh=xyz')).toBe('https://www.instagram.com/p/DQx1abcDEF/');
    expect(postLink('https://instagram.com/reels/ABCDE123/')).toBe('https://www.instagram.com/reel/ABCDE123/');
    expect(postLink('https://www.instagram.com/zafiro.zone/p/ABCDE123/')).toBe('https://www.instagram.com/p/ABCDE123/');
    expect(postLink('https://www.tiktok.com/@sala.x/video/7412345678901234567?lang=es')).toBe('https://www.tiktok.com/@sala.x/video/7412345678901234567');
    expect(postLink('https://vm.tiktok.com/ZMabc123/')).toBe('https://vm.tiktok.com/ZMabc123/');
    expect(postLink('https://www.instagram.com/zafiro.zone/')).toBeNull();
    expect(postLink('https://evil.test/p/ABCDE123/')).toBeNull();
    expect(postLink('javascript:alert(1)')).toBeNull();
  });
});
