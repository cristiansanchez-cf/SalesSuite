import { afterEach, describe, expect, test } from 'vitest';
import { isSameOriginWrite, requestHost, requestOrigin } from './http';

const req = (method: string, headers: Record<string, string>) => new Request('http://localhost/x', { method, headers });

describe('host real', () => {
  afterEach(() => { delete process.env.TRUST_FORWARDED_HOST; });

  test('usa Host; ignora X-Forwarded-Host salvo que se confíe en el proxy', () => {
    const r = req('GET', { host: 'Pitch.EnjoyTheClub.es', 'x-forwarded-host': 'evil.com' });
    expect(requestHost(r)).toBe('pitch.enjoytheclub.es');
    process.env.TRUST_FORWARDED_HOST = '1';
    expect(requestHost(r)).toBe('evil.com');
  });

  test('origen con protocolo del proxy de confianza', () => {
    process.env.TRUST_FORWARDED_HOST = '1';
    const r = req('GET', { host: 'internal:8080', 'x-forwarded-host': 'pitch.enjoytheclub.es', 'x-forwarded-proto': 'https' });
    expect(requestOrigin(r, new URL('http://localhost:4321'))).toBe('https://pitch.enjoytheclub.es');
  });
});

describe('CSRF', () => {
  const H = 'pitch.enjoytheclub.es';
  test.each([
    ['GET sin origin', 'GET', {}, true],
    ['POST mismo origen', 'POST', { origin: 'https://pitch.enjoytheclub.es' }, true],
    ['POST otro origen', 'POST', { origin: 'https://evil.com' }, false],
    ['POST otro tenant', 'POST', { origin: 'https://enjoy.cofundo.app' }, false],
    ['POST origin null', 'POST', { origin: 'null' }, false],
    ['POST sin origin, same-origin fetch', 'POST', { 'sec-fetch-site': 'same-origin' }, true],
    ['POST sin origin ni sec-fetch', 'POST', {}, false],
    ['DELETE cross-site', 'DELETE', { 'sec-fetch-site': 'cross-site' }, false],
  ] as const)('%s', (_n, method, headers, ok) => {
    expect(isSameOriginWrite(req(method, headers as Record<string, string>), H)).toBe(ok);
  });
});
