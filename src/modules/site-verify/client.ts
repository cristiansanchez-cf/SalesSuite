/**
 * site-verify: al verse la diapositiva (una vez), el cursor va al sello, lo pulsa y se abre el registro. El sello también
 * se pulsa a mano; «Ver otra vez» repite la escena. Sin animaciones (prefers-reduced-motion): el registro, abierto.
 */
import { onVisibility } from '../runtime';

export function init(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('.sv-stage')!;
  const seal = root.querySelector<HTMLButtonElement>('.sv-seal')!;
  const panel = root.querySelector<HTMLElement>('.sv-record')!;
  const close = root.querySelector<HTMLButtonElement>('[data-sv-close]');
  const replay = root.querySelector<HTMLButtonElement>('[data-sv-replay]');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let played = false;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const at = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
  const step = (s: string) => { stage.dataset.step = s; };
  const open = (v: boolean) => {
    panel.dataset.open = v ? '1' : '0';
    seal.setAttribute('aria-expanded', String(v));
    stage.classList.toggle('is-open', v);
  };
  function play() {
    clear(); open(false); step('idle');
    if (reduce) { step('done'); open(true); return; }
    at(500, () => step('move'));
    at(1950, () => step('click'));
    at(2350, () => { step('done'); open(true); });
  }
  const onSeal = () => { clear(); step('done'); open(panel.dataset.open !== '1'); };
  const onClose = () => { open(false); seal.focus(); };
  const onReplay = () => play();
  seal.addEventListener('click', onSeal);
  close?.addEventListener('click', onClose);
  replay?.addEventListener('click', onReplay);
  const stop = onVisibility(root, (visible) => { if (visible && !played) { played = true; play(); } }, 0.35);
  return () => {
    clear(); stop();
    seal.removeEventListener('click', onSeal);
    close?.removeEventListener('click', onClose);
    replay?.removeEventListener('click', onReplay);
  };
}
