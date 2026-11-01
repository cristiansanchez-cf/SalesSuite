/** Estado del alta de un espacio (Plataforma): qué pasos están y dónde se hace cada uno. */
import { describe, expect, test } from 'vitest';
import type { PlatformSetup } from './types';
import { SETUP_STEPS, setupSteps } from './setup-status';

const EMPTY: PlatformSetup = { admins: 0, pitch: 0, segments: 0, personas: 0, facets: 0, plays: 0, prices: 0, logo: false, accounts: 0 };
const FULL: PlatformSetup = { admins: 1, pitch: 1, segments: 2, personas: 3, facets: 1, plays: 5, prices: 1, logo: true, accounts: 10 };
const doneOf = (s: PlatformSetup, published = 0) => Object.fromEntries(setupSteps(s, published).map((x) => [x.key, x.done]));

describe('estado del alta', () => {
  test('espacio recién creado: nada hecho, en el orden de los pasos, cada uno con su sitio', () => {
    const steps = setupSteps(EMPTY, 0);
    expect(steps.map((x) => x.key)).toEqual([...SETUP_STEPS]);
    expect(steps.every((x) => !x.done)).toBe(true);
    expect(Object.fromEntries(steps.filter((x) => x.key !== 'propuesta').map((x) => [x.key, x.path]))).toEqual({
      admin: '/admin/team', empresa: '/admin/setup/agente', mercado: '/admin/setup/ia?b=mercado', situaciones: '/admin/setup/ia?b=situaciones',
      jugadas: '/admin/setup/ia?b=jugadas', precios: '/admin/prices', marca: '/admin/brand', crm: '/admin/accounts',
    });
    // «propuesta» va a la lista de propuestas (en main, '/admin'; antes '/admin/dossiers', que no existe como página).
    expect(steps.find((x) => x.key === 'propuesta')!.path).toMatch(/^\/admin(\/dossiers)?$/);
    // Todos los sitios son rutas internas de la consola (nada de enlaces a fuera).
    for (const x of steps) expect(x.path).toMatch(/^\/admin(\/|$)/);
  });

  test('todo listo', () => {
    expect(Object.values(doneOf(FULL, 1)).every(Boolean)).toBe(true);
  });

  test('umbrales: el mercado necesita sectores Y actores; las jugadas, al menos 5; la propuesta, una publicada', () => {
    expect(doneOf({ ...FULL, personas: 0 }, 1).mercado).toBe(false);
    expect(doneOf({ ...FULL, segments: 0 }, 1).mercado).toBe(false);
    expect(doneOf({ ...FULL, plays: 4 }, 1).jugadas).toBe(false);
    expect(doneOf({ ...FULL, plays: 5 }, 1).jugadas).toBe(true);
    expect(doneOf(FULL, 0).propuesta).toBe(false);
    expect(doneOf({ ...FULL, logo: false }, 1).marca).toBe(false);
  });
});
