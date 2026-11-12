/**
 * Runtime cliente de módulos: JS POR INSTANCIA (riesgo #1 del plan).
 *
 * Reglas para client.ts de cualquier módulo:
 *  - `init(root)` solo consulta dentro de `root` (nada de document.querySelector global).
 *  - Todo estado/timer vive en el closure de `init` → dos instancias no se pisan.
 *  - Devuelve una función de limpieza (timers, observers, listeners).
 *
 * `mountAll` se llama desde el <script> del Component.astro: Astro deduplica ese script
 * (se ejecuta una sola vez por página aunque haya N instancias), y aquí se inicializa
 * cada root `[data-module="<blockType>"]` exactamente una vez.
 */
export type ModuleInit = (root: HTMLElement) => void | (() => void);

const MOUNTED = new WeakMap<HTMLElement, () => void>();

export function mountAll(blockType: string, init: ModuleInit, scope: ParentNode = document): void {
  const roots = scope.querySelectorAll<HTMLElement>(`[data-module="${CSS.escape(blockType)}"]`);
  roots.forEach((root) => {
    if (MOUNTED.has(root)) return;
    const cleanup = init(root);
    MOUNTED.set(root, typeof cleanup === 'function' ? cleanup : () => {});
  });
}

export function unmount(root: HTMLElement): void {
  MOUNTED.get(root)?.();
  MOUNTED.delete(root);
}

/**
 * Ejecuta `cb(true|false)` cuando el root se ve de verdad / deja de verse. «Se ve» = al menos `threshold` de él en
 * pantalla, o (si es más alto que la pantalla) que ocupe ese tanto de ella. Así una animación empieza cuando la persona
 * llega, no cuando asoma un píxel (con solo `isIntersecting`, arrancaba antes y se veía a medias). Solo avisa al cambiar.
 */
export function onVisibility(root: Element, cb: (visible: boolean) => void, threshold = 0.25): () => void {
  if (typeof IntersectionObserver === 'undefined') { cb(true); return () => {}; }
  let last: boolean | null = null;
  const io = new IntersectionObserver(([e]) => {
    const fill = e.rootBounds && e.rootBounds.height > 0 ? e.intersectionRect.height / e.rootBounds.height : 0;
    const v = e.isIntersecting && (e.intersectionRatio >= threshold || fill >= threshold);
    if (v !== last) { last = v; cb(v); }
  }, { threshold: [...new Set([0, 0.1, threshold, 0.5, 0.75, 1])].sort((a, b) => a - b) });
  io.observe(root);
  return () => io.disconnect();
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
