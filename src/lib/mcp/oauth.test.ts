import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { authorizationServer, clientName, getClient, isCimdId, parseCimd, pkceOk, protectedResource, redirectMatches, setCimdGet, validRedirect, wwwAuthenticate } from './oauth';

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

describe('OAuth del MCP: CIMD (la identidad publicada de Claude)', () => {
  const ID = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
  const DOC = { client_id: ID, client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' };
  test('qué client_id es una URL de ficha', () => {
    expect(isCimdId(ID)).toBe(true);
    expect(isCimdId('http://claude.ai/oauth/x')).toBe(false);
    expect(isCimdId('https://claude.ai/')).toBe(false);
    expect(isCimdId('https://claude.ai/a#b')).toBe(false);
    expect(isCimdId('https://127.0.0.1/x')).toBe(false);
    expect(isCimdId('https://localhost/x')).toBe(false);
    expect(isCimdId('https://u:p@claude.ai/x')).toBe(false);
    expect(isCimdId('https://claude.ai/a/../b')).toBe(false);
    expect(isCimdId('https://claude.ai/' + 'a'.repeat(200))).toBe(false);
    expect(isCimdId('abcdefghijklmnop1234')).toBe(false);
  });
  test('la ficha tiene que ser de ella misma y traer vueltas válidas', () => {
    expect(parseCimd(ID, DOC)).toEqual({ clientId: ID, name: 'Claude', redirectUris: DOC.redirect_uris });
    expect(parseCimd(ID, { ...DOC, client_id: 'https://evil.test/x' })).toBeNull();
    expect(parseCimd(ID, { ...DOC, redirect_uris: ['javascript:alert(1)'] })).toBeNull();
    expect(parseCimd(ID, { ...DOC, redirect_uris: [] })).toBeNull();
    expect(parseCimd(ID, [DOC])).toBeNull();
    expect(parseCimd(ID, null)).toBeNull();
  });
  test('getClient lee la ficha (y la guarda); si luego no se puede leer, vale la guardada', async () => {
    process.env.DEMO_MODE = '1';
    let calls = 0;
    setCimdGet(async (url) => { calls++; return { status: 200, location: null, type: 'application/json', body: JSON.stringify({ ...DOC, client_id: url.href }) }; });
    expect(await getClient(ID)).toEqual({ clientId: ID, name: 'Claude', redirectUris: DOC.redirect_uris });
    await getClient(ID);
    expect(calls).toBe(1);   // la segunda, de la caché
    setCimdGet(async () => { throw new Error('caída'); });
    expect((await getClient(ID))?.name).toBe('Claude');
    setCimdGet(async () => ({ status: 404, location: null, type: 'text/html', body: '' }));
    expect(await getClient('https://otra.example.com/ficha')).toBeNull();
  });
});
