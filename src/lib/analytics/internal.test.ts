import { describe, expect, it } from 'vitest';
import { clientIp, ipHash } from './internal';

describe('aperturas internas', () => {
  it('clientIp toma la primera IP de x-forwarded-for y descarta basura', () => {
    expect(clientIp(new Request('https://x.test', { headers: { 'x-forwarded-for': '83.45.1.2, 10.0.0.1' } }))).toBe('83.45.1.2');
    expect(clientIp(new Request('https://x.test', { headers: { 'x-real-ip': '2a02:9130::1' } }))).toBe('2a02:9130::1');
    expect(clientIp(new Request('https://x.test', { headers: { 'x-forwarded-for': '<script>' } }))).toBeNull();
    expect(clientIp(new Request('https://x.test'))).toBeNull();
  });
  it('ipHash: estable, distinto por espacio y nunca la IP en claro', () => {
    const a = ipHash('83.45.1.2', 't1');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash('83.45.1.2', 't1')).toBe(a);
    expect(ipHash('83.45.1.2', 't2')).not.toBe(a);
    expect(a).not.toContain('83.45');
    expect(ipHash(null, 't1')).toBeNull();
  });
});
