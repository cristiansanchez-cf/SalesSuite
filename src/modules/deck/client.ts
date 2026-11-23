import { onVisibility, prefersReducedMotion } from '../runtime';
import { formatCount } from './ui';

/**
 * Por instancia (todos los bloques de deck): al verse, aparecen en escalera (CSS, `[data-revealed]`), las cifras cuentan
 * desde cero y las barras y el donut se llenan. Una sola vez.
 */
export function init(root: HTMLElement): () => void {
  let raf = 0;
  const stop = onVisibility(root, (v) => {
    if (!v) return;
    root.dataset.revealed = 'true';
    stop();
    const nums = Array.from(root.querySelectorAll<HTMLElement>('[data-deck-count]'));
    if (!nums.length || prefersReducedMotion()) return;
    const start = performance.now();
    const ms = 1400;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      for (const el of nums) {
        const d = el.dataset;
        el.textContent = `${d.prefix ?? ''}${formatCount(Number(d.deckCount) * e, { decimals: Number(d.dec) || 0, group: d.group ?? '', dec: d.decsep ?? ',' })}${d.suffix ?? ''}`;
      }
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }, 0.2);
  return () => { stop(); cancelAnimationFrame(raf); };
}
