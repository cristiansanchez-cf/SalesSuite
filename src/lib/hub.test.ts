import { describe, expect, it } from 'vitest';
import { hubRoute, hubUrl, isHubHost } from './hub';

describe('acceso general (ventas.cofundo.io)', () => {
  it('reconoce su host (y hub.localhost para probar), no los de los espacios', () => {
    expect(isHubHost('ventas.cofundo.io')).toBe(true);
    expect(isHubHost('VENTAS.cofundo.io:443')).toBe(true);
    expect(isHubHost('hub.localhost:4321')).toBe(true);
    expect(isHubHost('enjoy.ventas.cofundo.io')).toBe(false);
    expect(isHubHost('localhost')).toBe(false);
  });

  it('solo entrar, confirmar, elegir, ir y salir; lo demás, a elegir', () => {
    for (const p of ['/admin/login', '/admin/auth/confirm', '/admin/elige', '/admin/ir', '/admin/logout', '/_astro/x.css', '/favicon.svg']) expect(hubRoute(p)).toBe('pass');
    for (const p of ['/', '/admin', '/admin/crm', '/admin/api/x', '/d/token', '/admin/leads/configurar']) expect(hubRoute(p)).toBe('pick');
  });

  it('su dirección: la de producción, o hub.localhost con el puerto en local', () => {
    expect(hubUrl('https://enjoy.ventas.cofundo.io')).toBe('https://ventas.cofundo.io');
    expect(hubUrl('http://enjoy.localhost:4321')).toBe('http://hub.localhost:4321');
  });
});
