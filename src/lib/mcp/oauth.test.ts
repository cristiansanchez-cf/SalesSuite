import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { authorizationServer, clientName, pkceOk, protectedResource, redirectMatches, validRedirect, wwwAuthenticate } from './oauth';

describe('OAuth del MCP: reglas', () => {
  test('PKCE S256', () => {
    const v = 'a'.repeat(43) + '-._~';
    const c = createHash('sha256').update(v).digest('base64url');
    expect(pkceOk(v, c)).toBe(true);
    expect(pkceOk('b'.repeat(43), c)).toBe(false);
    expect(pkceOk('corto', createHash('sha256').update('corto').digest('base64url'))).toBe(false);
  });
  test('direcciones de vuelta que se pueden registrar', () => {
    expect(validRedirect('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(validRedirect('http://127.0.0.1/callback')).toBe(true);
    expect(validRedirect('http://localhost:3334/oauth/callback')).toBe(true);
    expect(validRedirect('cursor://anysphere.cursor-retrieval/oauth/callback')).toBe(true);
    expect(validRedirect('http://evil.example/cb')).toBe(false);
    expect(validRedirect('javascript:alert(1)')).toBe(false);
    expect(validRedirect('https://claude.ai/cb#frag')).toBe(false);
    expect(validRedirect('https://user:pw@claude.ai/cb')).toBe(false);
    expect(validRedirect('no es una url')).toBe(false);
  });
  test('la vuelta tiene que ser la registrada; en loopback el puerto no cuenta', () => {
    const reg = ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1/callback'];
    expect(redirectMatches(reg, 'https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(redirectMatches(reg, 'http://127.0.0.1:53111/callback')).toBe(true);
    expect(redirectMatches(reg, 'http://127.0.0.1:53111/otra')).toBe(false);
    expect(redirectMatches(reg, 'https://claude.ai/api/mcp/auth_callback?x=1')).toBe(false);
    expect(redirectMatches(reg, 'https://claude.ai.evil.example/api/mcp/auth_callback')).toBe(false);
    expect(redirectMatches(reg, 'http://localhost:53111/callback')).toBe(false);
  });
  test('nombre del cliente limpio; si no lo dice, su dominio', () => {
    expect(clientName('  Claude  ', [])).toBe('Claude');
    expect(clientName('<script>x</script>', ['https://a.example/cb'])).toBe('scriptx/script');
    expect(clientName('', ['https://chatgpt.com/connector/oauth/abc'])).toBe('chatgpt.com');
  });
  test('metadatos: el recurso igual a la URL que se pega; el 401 dice dónde mirar', () => {
    expect(protectedResource('https://enjoy.cofundo.io')).toMatchObject({ resource: 'https://enjoy.cofundo.io/api/mcp', authorization_servers: ['https://enjoy.cofundo.io'] });
    expect(authorizationServer('https://x.io')).toMatchObject({ issuer: 'https://x.io', code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] });
    expect(wwwAuthenticate('https://x.io')).toBe('Bearer resource_metadata="https://x.io/.well-known/oauth-protected-resource/api/mcp", scope="crm offline_access"');
  });
});
