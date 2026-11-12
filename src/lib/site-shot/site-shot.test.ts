import { beforeEach, describe, expect, it } from 'vitest';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { demoDb, resetDemoDb } from '../data/store';
import { captureSite, fetchShot, fixtureProvider, microlink, ShotError, shortAddress, siteAddress } from '.';

describe('la dirección de su web', () => {
  it('acepta lo que suele haber en el CRM y lo deja en https', () => {
    expect(siteAddress('sorianatural.es')).toBe('https://sorianatural.es/');
    expect(siteAddress('www.marca.com/tienda')).toBe('https://www.marca.com/tienda');
    expect(siteAddress('http://marca.com#x')).toBe('http://marca.com/');
    expect(shortAddress('https://www.marca.com/tienda/')).toBe('marca.com/tienda');
  });
  it('rechaza lo que no es una web pública', () => {
    for (const v of ['', 'hola', 'ftp://marca.com', 'javascript:alert(1)', 'https://127.0.0.1', 'http://localhost:3000', 'https://x.localhost', 'https://user:pw@marca.com', 'https://marca.com:8443', 'mi web.com']) {
      expect(siteAddress(v)).toBeNull();
    }
  });
});

describe('el servicio de capturas (Microlink)', () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  it('pide la captura a 1440×900 y devuelve la imagen de su CDN; la clave, solo en la cabecera', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const p = microlink({ key: 'k', fetch: async (u, init) => { calls.push({ url: String(u), init }); return ok({ status: 'success', data: { screenshot: { url: 'https://iad.microlink.io/abc.png' } } }); } });
    expect(await p.shoot('https://marca.com/')).toEqual({ imageUrl: 'https://iad.microlink.io/abc.png' });
    const u = new URL(calls[0].url);
    expect(u.origin).toBe('https://pro.microlink.io');
    expect(u.searchParams.get('url')).toBe('https://marca.com/');
    expect(u.searchParams.get('viewport.width')).toBe('1440');
    expect(u.search).not.toContain('k&');
    expect((calls[0].init?.headers as Record<string, string>)['x-api-key']).toBe('k');
  });
  it('errores: límite, dirección mala y una imagen que no es de su CDN', async () => {
    await expect(microlink({ fetch: async () => ok({ status: 'fail', code: 'ERATELIMIT' }, 429) }).shoot('https://a.com/')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(microlink({ fetch: async () => ok({ status: 'fail', code: 'EINVALURL' }, 400) }).shoot('https://a.com/')).rejects.toMatchObject({ code: 'INVALID_URL' });
    await expect(microlink({ fetch: async () => ok({ status: 'success', data: { screenshot: { url: 'https://evil.test/x.png' } } }) }).shoot('https://a.com/')).rejects.toMatchObject({ code: 'FAILED' });
  });
  it('descarga solo del CDN, solo imágenes y con tope de tamaño', async () => {
    const img = (type: string, n = 10) => async () => new Response(new Uint8Array(n), { headers: { 'content-type': type } });
    await expect(fetchShot('https://evil.test/x.png', 100, { origin: 'http://x', fetch: img('image/png') })).rejects.toBeInstanceOf(ShotError);
    await expect(fetchShot('https://iad.microlink.io/x.png', 100, { origin: 'http://x', fetch: img('text/html') })).rejects.toMatchObject({ code: 'FAILED' });
    await expect(fetchShot('https://iad.microlink.io/x.png', 5, { origin: 'http://x', fetch: img('image/png', 10) })).rejects.toMatchObject({ code: 'TOO_LARGE' });
    expect((await fetchShot('https://iad.microlink.io/x.png', 100, { origin: 'http://x', fetch: img('image/png') })).type).toBe('image/png');
  });
});

describe('capturar su web y dejarla en la propuesta', () => {
  beforeEach(() => resetDemoDb());
  const REP = '11111111-1111-4111-8111-111111111111';
  async function setup() {
    const d = demoDb();
    const dossier = d.dossier.find((x) => x.author_id === REP)!;
    const admin = (await contextAs((await publicRepository().resolveTenantBySlug('enjoy'))!, REP))!;
    const puts: string[] = [];
    const deps = { provider: fixtureProvider(), origin: 'http://app.test', put: async (u: string) => { puts.push(u); },
      fetch: (async (u: string) => (String(u) === 'http://app.test/demo/web-ejemplo.jpg' ? new Response(new Uint8Array([255, 216, 255]), { headers: { 'content-type': 'image/jpeg' } }) : new Response('', { status: 404 }))) as unknown as typeof fetch };
    return { admin, id: dossier.id, deps, puts };
  }
  it('la captura queda como «Su web», con su dirección', async () => {
    const { admin, id, deps, puts } = await setup();
    const r = await captureSite(admin, id, { url: 'valleverde.es' }, deps);
    expect(r.ok).toBe(true);
    expect(puts).toHaveLength(1);
    const m = (await admin.service.getState(id)).dossier.clientMedia;
    expect(m?.site).toMatch(/\/dossiers\/.+\/site-|^\/demo-media\//);
    expect(m?.siteUrl).toBe('https://valleverde.es/');
  });
  it('dirección mala o web que no se deja: se dice el motivo y no se toca nada', async () => {
    const { admin, id, deps, puts } = await setup();
    expect(await captureSite(admin, id, { url: 'no es una web' }, deps)).toMatchObject({ ok: false, code: 'INVALID_URL' });
    expect(await captureSite(admin, id, { url: 'noexiste.com' }, deps)).toMatchObject({ ok: false, code: 'FAILED' });
    expect(await captureSite(admin, id, { url: 'marca.com' }, { ...deps, provider: null })).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    expect(puts).toHaveLength(0);
  });
});
