import { describe as group, expect, it } from 'vitest';
import { catalogText, cleanPicks, describe, discountPct, freeNotes, listPrice, tierOf, type Product } from './packages';

const p = (key: string, name: string, o: Partial<Product> = {}): Product => ({
  id: key, key, name, summary: null, includes: [], prices: { small: 25, medium: 25, large: 50 }, currency: 'EUR', period: 'month',
  freeAllowed: false, freeNote: null, position: 0, active: true, ...o,
});
const CAT = [
  p('canciones', 'Canciones', { freeAllowed: true, freeNote: 'las propinas son para Enjoy' }),
  p('pantalla', 'Pantalla'), p('album', 'Álbum'), p('fidelizacion', 'Fidelización'), p('viejo', 'Viejo', { active: false }),
];

group('paquetes', () => {
  it('tramo por tamaño: masivo paga como grande; sin tamaño, mediano', () => {
    expect([tierOf('small'), tierOf('medium'), tierOf('large'), tierOf('huge'), tierOf(null)]).toEqual(['small', 'medium', 'large', 'large', 'medium']);
  });
  it('lo elegido: existe, activo, sin repetir y gratis solo si se puede', () => {
    expect(cleanPicks(['canciones:free', 'pantalla:free', 'album', 'album', 'viejo', 'nada'], CAT)).toEqual([
      { key: 'canciones', free: true }, { key: 'pantalla', free: false }, { key: 'album', free: false },
    ]);
  });
  it('precio normal por tamaño (lo gratis no suma) y descuento', () => {
    const picks = cleanPicks(['canciones', 'pantalla', 'album'], CAT);
    expect(listPrice(picks, CAT, 'medium')).toBe(75);
    expect(listPrice(picks, CAT, 'large')).toBe(150);
    expect(listPrice(cleanPicks(['canciones:free', 'album'], CAT), CAT, 'small')).toBe(25);
    expect(listPrice(cleanPicks(['album'], [p('album', 'Álbum', { prices: { small: null, medium: 25, large: 50 } })]), [p('album', 'Álbum', { prices: { small: null, medium: 25, large: 50 } })], 'small')).toBeNull();
    expect(discountPct(60, 75)).toBe(20);
    expect(discountPct(75, 75)).toBeNull();
  });
  it('en una línea, con el descuento y las condiciones de lo gratis', () => {
    const picks = cleanPicks(['canciones:free', 'album', 'pantalla'], CAT);
    expect(describe(picks, CAT, { price: 40, list: 50 })).toBe('Canciones (gratis) + Álbum + Pantalla · 40 €/mes (normal 50 €/mes, −20 %)');
    expect(describe(cleanPicks(['canciones:free'], CAT), CAT, { price: 0, list: 0 })).toBe('Canciones (gratis) · gratis');
    expect(freeNotes(picks, CAT)).toEqual(['Canciones: las propinas son para Enjoy']);
  });
  it('catálogo para la IA: solo lo activo, con precios y lo gratis', () => {
    const t = catalogText(CAT);
    expect(t).toContain('- Canciones (canciones)');
    expect(t).toContain('Puede ir gratis: las propinas son para Enjoy');
    expect(t).toContain('grande 50 €/mes');
    expect(t).not.toContain('Viejo');
  });
});
