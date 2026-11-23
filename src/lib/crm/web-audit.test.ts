import { describe, expect, test } from 'vitest';
import { auditHtml, auditProblems, auditText, readAudit, seoProblems, unreachable } from './web-audit';

const NOW = new Date('2026-11-23T12:00:00Z');
const OLD = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "x">
<html><head><meta name="generator" content="WordPress 4.9.8"><script src="/wp-includes/js/jquery/jquery-1.12.4.min.js"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC"></script><!--[if lt IE 9]><script src="html5.js"></script><![endif]--></head>
<body><center><font size="2">Bienvenidos</font></center><a href="/aviso-legal/">Aviso legal</a>
<footer>&copy; 2012 - 2016 Restaurante Ejemplo</footer></body></html>`;
const NEW = `<!doctype html><html lang="es"><head><title>Sala Nueva · Conciertos en Málaga</title><meta name="description" content="Sala de conciertos en el centro de Málaga, con programación todas las semanas.">
<meta property="og:title" content="Sala Nueva"><meta name="viewport" content="width=device-width"><script src="https://consent.cookiebot.com/uc.js"></script>
<script src="https://connect.facebook.net/en_US/fbevents.js"></script></head><body>
<a href="/legal">Aviso legal</a> · <a href="/privacidad">Política de privacidad</a> · <a href="/politica-de-cookies">Cookies</a> · <a href="/terminos">Términos y condiciones</a>
<h1>Sala Nueva</h1><img src="a.jpg" alt="La sala"><p>© 2026 Sala Nueva</p></body></html>`;

describe('auditHtml', () => {
  test('una web antigua: sin móvil, sin HTTPS, señales viejas, sin privacidad ni cookies', () => {
    const a = auditHtml(OLD, new URL('http://ejemplo.es/'), NOW);
    expect(a).toMatchObject({ ok: true, https: false, mobile: false, year: 2016, platform: 'WordPress 4.9.8', cookieBanner: false });
    expect(a.old).toEqual(expect.arrayContaining(['jQuery 1.12.4', 'WordPress 4.9', 'HTML antiguo (<font>, <center>…)', 'HTML 4 / XHTML 1.0', 'Código para Internet Explorer']));
    expect(a.legal).toEqual({ notice: true, privacy: false, cookies: false, terms: false });
    expect(a.trackers).toEqual(['Google Analytics']);
    expect(auditProblems(a, NOW)).toEqual(['https', 'mobile', 'year', 'old', 'privacy', 'cookies', 'banner', 'trackersNoConsent', 'seoTitle', 'seoDescription', 'seoH1', 'seoLang', 'seoOg']);
  });
  test('una web cuidada: todo en orden', () => {
    const a = auditHtml(NEW, new URL('https://salanueva.es/'), NOW);
    expect(a).toMatchObject({ https: true, mobile: true, year: 2026, cookieBanner: true, old: [] });
    expect(a.legal).toEqual({ notice: true, privacy: true, cookies: true, terms: true });
    expect(a.trackers).toEqual(['Meta Pixel']);
    expect(auditProblems(a, NOW)).toEqual([]);
  });
  test('SEO básico: título, descripción, H1, idioma, redes, alt y noindex', () => {
    const good = auditHtml(NEW, new URL('https://salanueva.es/'), NOW);
    expect(good.seo).toEqual({ title: 'Sala Nueva · Conciertos en Málaga', description: true, h1: 1, lang: true, og: true, images: 1, noAlt: 0, noindex: false });
    const bad = auditHtml('<html><head><title>Inicio</title><meta name="robots" content="noindex, nofollow"></head><body><img src="a.jpg"><img src="b.jpg" alt=""><img src="c.jpg" alt="ok"></body></html>', new URL('https://x.es/'), NOW);
    expect(seoProblems(bad)).toEqual(['seoTitle', 'seoDescription', 'seoH1', 'seoLang', 'seoOg', 'seoAlt', 'seoNoindex']);
    expect(auditText(bad)).toContain('título: «Inicio»');
  });
  test('plataformas con su propio banner: no se sabe (null), no «falta»', () => {
    const a = auditHtml('<html><head><meta name="viewport" content="x"></head><body><img src="https://static.wixstatic.com/a.png"></body></html>', new URL('https://x.es/'), NOW);
    expect(a.platform).toBe('Wix');
    expect(a.cookieBanner).toBeNull();
    expect(auditProblems(a, NOW)).not.toContain('banner');
  });
  test('el texto del banner también cuenta; un © del futuro de plantilla no', () => {
    const a = auditHtml('<body><div>Utilizamos cookies propias y de terceros. <button>Aceptar todas las cookies</button></div><p>© 2099</p></body>', new URL('https://x.es/'), NOW);
    expect(a.cookieBanner).toBe(true);
    expect(a.year).toBeNull();
  });
  test('sin abrir; en texto para la IA; leer lo guardado', () => {
    expect(auditProblems(unreachable('https://caida.es/'))).toEqual(['unreachable']);
    expect(auditText(unreachable('https://caida.es/'))).toContain('No se ha podido abrir');
    const a = auditHtml(OLD, new URL('http://ejemplo.es/'), NOW);
    expect(auditText(a)).toContain('privacidad: no');
    expect(readAudit(JSON.parse(JSON.stringify(a)))).toEqual(a);
    expect(readAudit({ url: 1 })).toBeNull();
  });
});
