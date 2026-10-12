import { describe, expect, test } from 'vitest';
import { memoReads, type ReadCache } from './request-cache';

function fakeDb() {
  const calls: string[] = [];
  let zones = [{ id: 'z1', name: 'Valencia' }];
  return {
    calls,
    db: {
      async listZones(t: string) { calls.push(`listZones:${t}`); return zones; },
      async listOther() { calls.push('listOther'); return [1]; },
      async saveZone(name: string) { calls.push('saveZone'); zones = [...zones, { id: 'z2', name }]; },
      async getBroken() { calls.push('getBroken'); throw new Error('caída'); },
    },
  };
}

describe('caché de lecturas por petición', () => {
  test('la segunda lectura igual sale de memoria; con otros argumentos, no', async () => {
    const { db, calls } = fakeDb();
    const c = memoReads(db, ['listZones'], new Map(), 'x');
    await c.listZones('t1'); await c.listZones('t1'); await c.listZones('t2');
    expect(calls).toEqual(['listZones:t1', 'listZones:t2']);
  });

  test('una escritura (en cualquier base que comparta la caché) la vacía', async () => {
    const cache: ReadCache = new Map();
    const a = fakeDb(); const b = fakeDb();
    const ca = memoReads(a.db, ['listZones'], cache, 'a');
    const cb = memoReads(b.db, [], cache, 'b');
    await ca.listZones('t');
    await cb.saveZone('Madrid');
    await ca.listZones('t');
    expect(a.calls).toEqual(['listZones:t', 'listZones:t']);
    await a.db.saveZone('Sevilla');           // sin pasar por el proxy no se entera: por eso se comparte una caché
    expect((await ca.listZones('t')).length).toBe(1);
    await ca.saveZone('Bilbao');
    expect((await ca.listZones('t')).length).toBe(3);
  });

  test('devuelve copias: cambiar lo recibido no cambia lo guardado', async () => {
    const { db } = fakeDb();
    const c = memoReads(db, ['listZones'], new Map(), 'x');
    (await c.listZones('t'))[0].name = 'Cambiado';
    expect((await c.listZones('t'))[0].name).toBe('Valencia');
  });

  test('las lecturas que no están en la lista no se guardan ni vacían; un fallo no se queda guardado', async () => {
    const { db, calls } = fakeDb();
    const c = memoReads(db, ['listZones', 'getBroken'], new Map(), 'x');
    await c.listZones('t'); await c.listOther(); await c.listOther(); await c.listZones('t');
    expect(calls).toEqual(['listZones:t', 'listOther', 'listOther']);
    await expect(c.getBroken()).rejects.toThrow('caída');
    await expect(c.getBroken()).rejects.toThrow('caída');
    expect(calls.filter((x) => x === 'getBroken').length).toBe(2);
  });
});
