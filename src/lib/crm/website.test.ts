import { describe, expect, test } from 'vitest';
import { cleanTaxId, fixtureWebsite, legalLinks, nodeGet, parseLegal, parseSocials, privateIp, realWebsite, safeUrl, validCif } from './website';

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
    const get = async (u: URL) => { calls.push(String(u)); return { status: 302, location: 'http://interno.club.es/', type: 'text/html', body: '' }; };
    const lookup = async (h: string) => (h === 'club.es' ? ['93.184.216.34'] : ['10.0.0.5']);
    expect(await realWebsite(get, lookup).scan('https://club.es/')).toEqual({ instagram: null, facebook: null, linkedin: null, email: null });
    expect(calls).toEqual(['https://club.es/']);
  });

  test('al conectar también se comprueba la dirección (contra el cambio de DNS entre medias)', async () => {
    const get = nodeGet(() => false);   // el DNS «cambia» a una interna justo al conectar
    await expect(get(new URL('http://example.com/'), new AbortController().signal)).rejects.toBeTruthy();
    for (const ip of ['::ffff:127.0.0.1', '64:ff9b::10.0.0.1', '2002:a00:1::', '198.18.0.1', '::10.0.0.1']) expect(privateIp(ip)).toBe(true);
  });
});

describe('titular de la web (§25)', () => {
  test('el CIF tiene que cuadrar; el DNI de una persona no es un CIF', () => {
    expect(validCif('B12345674')).toBe(true);
    expect(validCif('B12345675')).toBe(false);
    expect(validCif('Q2826000H')).toBe(true);
    expect(validCif('12345678Z')).toBe(false);
    expect(cleanTaxId('b-12.345.674')).toBe('B12345674');
  });

  test('aviso legal: razón social junto al CIF', () => {
    const html = `<h1>Aviso legal</h1><p>1. DATOS IDENTIFICATIVOS Ocio Cosmic Group 2010, S.L., con C.I.F. B-12.345.674 y domicilio en Calle Mayor 1, Madrid.</p>
      <p>Usamos Google Analytics de Google Ireland Limited.</p><script>var x = "Falsa Empresa S.L. B87654321";</script>`;
    expect(parseLegal(html)).toEqual({ legalName: 'Ocio Cosmic Group 2010, S.L.', taxId: 'B12345674' });
  });

  test('sin CIF: el nombre solo si dice que es el titular', () => {
    expect(parseLegal('<p>Titular: Tulum Eventos SLU</p>').legalName).toBe('Tulum Eventos, S.L.U.');
    expect(parseLegal('<p>Pagos seguros con Stripe Payments Europe S.A. y reservas con Amigos de la Noche S.L.</p>').legalName).toBeNull();
    expect(parseLegal('<p>Sala de fiestas en el centro</p>')).toEqual({ legalName: null, taxId: null });
  });

  test('enlaces legales de la misma web, el aviso legal primero', () => {
    const html = `<a href="/politica-de-privacidad/">Privacidad</a><a href="https://otra.com/aviso-legal">x</a>
      <a href="/cookies">Cookies</a><a href="/aviso-legal">Aviso legal</a><a href="/carta">Carta</a>`;
    expect(legalLinks(html, new URL('https://www.club.es/')).map(String)).toEqual(['https://www.club.es/aviso-legal', 'https://www.club.es/politica-de-privacidad/', 'https://www.club.es/cookies']);
  });

  test('si la portada no lo dice, mira el aviso legal (con las mismas reglas de seguridad)', async () => {
    const calls: string[] = [];
    const get = async (u: URL) => {
      calls.push(String(u));
      const body = u.pathname === '/' ? '<a href="https://www.instagram.com/clubsol/">IG</a><a href="/aviso-legal">Aviso legal</a><a href="http://10.0.0.1/legal">Legal</a>'
        : '<p>Titular: Noches del Sol, S.L. CIF: B12345674</p>';
      return { status: 200, location: null, type: 'text/html', body };
    };
    const r = await realWebsite(get, async () => ['93.184.216.34']).scan('https://clubsol.es/');
    expect(r).toMatchObject({ instagram: 'https://www.instagram.com/clubsol/', legalName: 'Noches del Sol, S.L.', taxId: 'B12345674' });
    expect(calls).toEqual(['https://clubsol.es/', 'https://clubsol.es/aviso-legal']);
  });

  test('la web de pruebas: las de «cosmic…» comparten titular', async () => {
    const a = await fixtureWebsite().scan('https://cosmicsur.test/');
    const b = await fixtureWebsite().scan('https://cosmicnorte.test/');
    expect(a.taxId).toBe(b.taxId);
    expect(validCif(a.taxId!)).toBe(true);
  });
});
