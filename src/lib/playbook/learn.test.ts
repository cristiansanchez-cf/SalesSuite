import { describe, expect, it } from 'vitest';
import { firstImage, tourOf } from './service';

describe('Aprende: recorrido y portadas', () => {
  it('firstImage encuentra la primera captura dentro de las props', () => {
    expect(firstImage({ title: 'x', tabs: [{ mock: { kind: 'chat' } }, { mock: { kind: 'image', src: 'https://cdn.test/a.webp' } }] })).toBe('https://cdn.test/a.webp');
    expect(firstImage({ src: '/demo/enjoy/img/qr.webp' })).toBe('/demo/enjoy/img/qr.webp');
    expect(firstImage({ href: 'https://enjoy.test/', title: 'sin imagen' })).toBeNull();
    expect(firstImage({ src: 'javascript:alert(1).png' })).toBeNull();
  });

  it('tourOf valida, recorta y descarta lo que no sirve', () => {
    const t = tourOf([
      { title: 'Escanea', body: 'Sin app', image: '/img/qr.webp' },
      { title: '', body: 'sin título' },
      { title: 'Pantalla', image: 'url("x")' },
      'basura',
      ...Array.from({ length: 10 }, (_, i) => ({ title: `Paso ${i}` })),
    ]);
    expect(t[0]).toEqual({ title: 'Escanea', body: 'Sin app', image: '/img/qr.webp', ui: null });
    expect(t[1]).toEqual({ title: 'Pantalla', body: null, image: null, ui: null });
    expect(t.length).toBeLessThanOrEqual(8);
    expect(tourOf(null)).toEqual([]);
    // UI en vez de foto: solo las formas conocidas.
    const u = tourOf([{ title: 'a', ui: 'phone:scan' }, { title: 'b', ui: 'screen:club.photo,tp.photo' }, { title: 'c', ui: 'report' }, { title: 'd', ui: '<script>' }]);
    expect(u.map((x) => x.ui)).toEqual(['phone:scan', 'screen:club.photo,tp.photo', 'report', null]);
    expect(tourOf({ title: 'x' })).toEqual([]);
  });
});
