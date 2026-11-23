import { init as reveal } from '../deck/client';

/** Al pulsar un paso: se marca, se resaltan sus pilares y se enseña su pantalla. Todo dentro de este root. */
export function init(root: HTMLElement): () => void {
  const stop = reveal(root);
  const steps = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-step]'));
  const pillars = Array.from(root.querySelectorAll<HTMLElement>('[data-pillar]'));
  const shots = Array.from(root.querySelectorAll<HTMLElement>('[data-shot]'));
  const pick = (i: number) => {
    const on = new Set((steps[i]?.dataset.pillars ?? '').split(',').filter(Boolean));
    steps.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    root.toggleAttribute('data-picking', on.size > 0);
    pillars.forEach((p) => p.classList.toggle('is-on', on.has(p.dataset.pillar ?? '')));
    shots.forEach((s, j) => { s.hidden = j !== i; });
  };
  const handlers = steps.map((b, i) => { const h = () => pick(i); b.addEventListener('click', h); return () => b.removeEventListener('click', h); });
  pick(0);
  return () => { stop(); handlers.forEach((h) => h()); };
}
