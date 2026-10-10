import { describe, expect, test } from 'vitest';
import { parseSocials, privateIp, realWebsite, safeUrl } from './website';

describe('mirar la web de la empresa', () => {
  test('saca Instagram, Facebook, LinkedIn y email de los enlaces; ignora los de compartir', () => {
    const html = `<a href="https://www.facebook.com/sharer/sharer.php?u=x">compartir</a><a href="https://instagram.com/p/Cx1/">post</a>
      <footer><a href="https://www.instagram.com/clubsol_vlc/">IG</a> <a href="https://es-es.facebook.com/ClubSolValencia/">FB</a>
      <a href="https://es.linkedin.com/company/club-sol">in</a> <a href="mailto:Reservas@ClubSol.es?subject=hola">mail</a> <img src="logo@2x.png"></footer>`;
    expect(parseSocials(html)).toEqual({ instagram: 'https://www.instagram.com/clubsol_vlc/', facebook: 'https://www.facebook.com/ClubSolValencia', linkedin: 'https://www.linkedin.com/company/club-sol', email: 'reservas@clubsol.es' });
    expect(parseSocials('<p>Nada por aquí</p>')).toEqual({ instagram: null, facebook: null, linkedin: null, email: null });
  });

  test('solo webs públicas: nada de IPs, puertos raros ni nombres internos', () => {
    expect(safeUrl('https://clubsol.es/')?.hostname).toBe('clubsol.es');
    for (const u of ['http://127.0.0.1/', 'http://localhost:3000/', 'file:///etc/passwd', 'http://[::1]/', 'https://x.internal/', 'https://a:b@club.es/', 'https://club.es:8080/']) expect(safeUrl(u)).toBeNull();
    for (const ip of ['10.0.0.1', '172.16.3.4', '192.168.1.1', '169.254.169.254', '127.0.0.1', '::1', 'fd00::1', '::ffff:10.1.1.1']) expect(privateIp(ip)).toBe(true);
    expect(privateIp('8.8.8.8')).toBe(false);
  });

  test('si el nombre apunta a la red interna, o redirige a ella, no se abre', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (u: URL) => { calls.push(String(u)); return new Response(null, { status: 302, headers: { location: 'http://interno.club.es/' } }); }) as unknown as typeof fetch;
    const lookup = async (h: string) => (h === 'club.es' ? ['93.184.216.34'] : ['10.0.0.5']);
    expect(await realWebsite(fetchImpl, lookup).scan('https://club.es/')).toEqual({ instagram: null, facebook: null, linkedin: null, email: null });
    expect(calls).toEqual(['https://club.es/']);
  });
});
