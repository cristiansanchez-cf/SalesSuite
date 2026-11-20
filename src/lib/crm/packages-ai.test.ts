import { describe, expect, it } from 'vitest';
import { diffOf, fixtureModelPlan, planPrompt, readPlan } from './packages-ai';
import type { Product } from './packages';

const p = (key: string, name: string, o: Partial<Product> = {}): Product => ({ id: key, key, name, summary: null, includes: ['a'], prices: { small: 25, medium: 25, large: 50 }, currency: 'EUR', period: 'month', freeAllowed: false, freeNote: null, position: 1, active: true, ...o });
const CAT = [p('canciones', 'Canciones', { freeAllowed: true, freeNote: 'propinas' }), p('album', 'Álbum'), p('viejo', 'Viejo', { active: false })];

describe('cambiar el modelo de negocio con IA', () => {
  it('lee los cambios contra el catálogo de verdad: claves que existen, sin repetir, sin «cambios» que no cambian', () => {
    const plan = readPlan({ summary: 'x', changes: [
      { action: 'update', key: 'album', name: 'Álbum', price_medium: 35, why: 'mediano a 35' },
      { action: 'update', key: 'album', name: 'Álbum', price_medium: 40 },
      { action: 'update', key: 'canciones', name: 'Canciones' },
      { action: 'update', key: 'no-existe', name: 'X' },
      { action: 'create', key: null, name: 'Fidelización', includes: ['Pases con sellos'], price_small: 25, price_medium: null, price_large: 50 },
      { action: 'deactivate', key: 'viejo', name: 'Viejo' },
      { action: 'borrar', key: 'album' },
    ] }, CAT);
    expect(plan.changes.map((c) => `${c.action}:${c.key ?? c.name}`)).toEqual(['update:album', 'create:Fidelización']);
    // Lo que no dice, lo de antes.
    expect(plan.changes[0]).toMatchObject({ prices: { small: 25, medium: 35, large: 50 }, includes: ['a'] });
    expect(plan.changes[1]!.prices).toEqual({ small: 25, medium: null, large: 50 });
    expect(diffOf(plan.changes[0]!, CAT[1])).toEqual(['price_medium']);
  });
  it('el prompt lleva el catálogo y lo que cuenta, entre marcas', () => {
    const t = planPrompt('subimos el mediano a 35', CAT);
    expect(t).toContain('"key":"canciones"');
    expect(t).toContain('<<<\nsubimos el mediano a 35\n>>>');
  });
  it('versión de prueba: mediano a 35, nuevo paquete y quitar uno', async () => {
    const plan = (await fixtureModelPlan().plan('Ponemos el mediano a 35. Nuevo paquete Bebidas: carta en el móvil, pedidos a 30. Quitamos Álbum.', CAT, { seller: 'Enjoy' }))!;
    expect(plan.changes.filter((c) => c.action === 'update' && c.prices.medium === 35).map((c) => c.key)).toEqual(['canciones']);
    expect(plan.changes.find((c) => c.action === 'create')).toMatchObject({ name: 'Bebidas', includes: ['carta en el móvil', 'pedidos'], prices: { small: 30, medium: 30, large: 60 } });
    expect(plan.changes.find((c) => c.action === 'deactivate')?.key).toBe('album');
  });
});
