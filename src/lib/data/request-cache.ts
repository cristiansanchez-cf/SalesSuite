/**
 * Caché de lecturas dentro de UNA petición (docs/DESARROLLO.md §3). Una ficha pedía las zonas, los miembros o la propia
 * empresa 3-4 veces (servicios distintos que cargan lo suyo). Con esto, la segunda vez sale de memoria.
 *
 * Reglas para que nunca devuelva algo viejo:
 * - Solo se guardan los métodos de `reads`, por método + argumentos.
 * - Cualquier llamada que no sea de lectura (no empieza por list/get/preview), en cualquiera de las bases que
 *   compartan la caché, la vacía entera: después de escribir, se vuelve a leer de verdad.
 * - Se devuelve una copia: quien modifique lo que recibe no cambia lo guardado.
 */
export type ReadCache = Map<string, Promise<unknown>>;
const isRead = (name: string) => /^(list|get|preview)/.test(name);

export function memoReads<T extends object>(db: T, reads: ReadonlyArray<keyof T & string>, cache: ReadCache, prefix: string): T {
  const want = new Set<string>(reads);
  return new Proxy(db, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== 'function' || typeof prop !== 'string') return v;
      return (...args: unknown[]) => {
        if (!isRead(prop)) { cache.clear(); return v.apply(target, args); }
        if (!want.has(prop)) return v.apply(target, args);
        const key = `${prefix}.${prop}:${JSON.stringify(args)}`;
        let hit = cache.get(key);
        if (!hit) {
          hit = Promise.resolve(v.apply(target, args));
          cache.set(key, hit);
          // Un fallo no se queda guardado: la siguiente vez se reintenta.
          hit.catch(() => { if (cache.get(key) === hit) cache.delete(key); });
        }
        return hit.then((x) => structuredClone(x));
      };
    },
  });
}
