import { onVisibility, prefersReducedMotion } from '../runtime';

/** Por instancia: rotación de palabras + reveal. Todo el estado vive en este closure. */
export function init(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];

  // Reveal de entrada (una vez).
  const stopReveal = onVisibility(root, (v) => {
    if (v) { root.dataset.revealed = 'true'; stopReveal(); }
  }, 0.15);
  cleanups.push(stopReveal);

  const words = Array.from(root.querySelectorAll<HTMLElement>('[data-hero-word]'));
  if (words.length > 1 && !prefersReducedMotion()) {
    const every = Number(root.dataset.rotateEvery) || 2200;
    let i = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const show = (n: number) => words.forEach((w, k) => w.toggleAttribute('data-active', k === n));
    const start = () => { if (!timer) timer = setInterval(() => { i = (i + 1) % words.length; show(i); }, every); };
    const stop = () => { clearInterval(timer); timer = undefined; };
    show(0);
    cleanups.push(onVisibility(root, (v) => (v ? start() : stop())), stop);
  }

  return () => cleanups.forEach((c) => c());
}
