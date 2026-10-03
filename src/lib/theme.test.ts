import { describe, expect, test } from 'vitest';
import { hexToChannels, mergeTheme, parseTheme, themeToCss } from './theme';

describe('theme', () => {
  test('hex → canales RGB', () => {
    expect(hexToChannels('#ff27bb')).toBe('255 39 187');
    expect(hexToChannels('#fff')).toBe('255 255 255');
  });

  test('serializa tokens del tenant como CSS vars sobre .ds-root', () => {
    const css = themeToCss(parseTheme({ colors: { primary: '#ff27bb', accent: '#e1ff00' }, radius: { card: '28px' } }));
    expect(css).toBe('.ds-root{--color-primary: 255 39 187;--color-accent: 225 255 0;--radius-card: 28px;}');
  });

  test('override de dossier gana al tenant', () => {
    const t = mergeTheme(parseTheme({ colors: { primary: '#000000', accent: '#111111' } }), parseTheme({ colors: { primary: '#ffffff' } }));
    expect(t.colors).toEqual({ primary: '#ffffff', accent: '#111111' });
  });

  test.each([
    { colors: { primary: 'red;}</style><script>' } },
    { colors: { primary: '#ff27bb', evil: '#000' } },
    { radius: { card: '10px;background:url(x)' } },
    { font: { sans: 'x}</style>' } },
    { font: { faces: [{ family: 'X', src: 'javascript:alert(1)' }] } },
    { font: { faces: [{ family: 'X', src: 'https://a.b/f.woff2) ;x' }] } },
    { font: { faces: [{ family: 'X', src: '//otro-host.com/f.woff2' }] } },
    { font: { faces: [{ family: 'X', src: 'http://a.b/f.woff2' }] } },
  ])('rechaza tokens peligrosos/desconocidos %#', (raw) => {
    expect(parseTheme(raw)).toEqual({});
  });

  test('fuentes servidas desde el propio sitio (/fonts/…) también valen', () => {
    expect(parseTheme({ font: { faces: [{ family: 'YWFTKul', src: '/demo/enjoy/fonts/ywft-kul-bold.woff2', weight: '700' }] } }).font?.faces?.[0].src).toBe('/demo/enjoy/fonts/ywft-kul-bold.woff2');
  });

  test('font-face válida', () => {
    const css = themeToCss(parseTheme({ font: { display: "'YWFTKul', sans-serif", faces: [{ family: 'YWFTKul', src: 'https://cdn.example.com/ywft.woff2' }] } }));
    expect(css).toContain("@font-face{font-family:'YWFTKul';src:url(https://cdn.example.com/ywft.woff2)");
    expect(css).toContain("--font-display: 'YWFTKul', sans-serif;");
  });
});
