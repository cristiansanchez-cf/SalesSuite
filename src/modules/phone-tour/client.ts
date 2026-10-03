import { onVisibility, prefersReducedMotion } from '../runtime';

/**
 * Por instancia: pasos del móvil del invitado. Va solo mientras se ve; tocar un paso lo deja ahí.
 * En cada paso: la pantalla entra, el texto se escribe solo y un dedo toca lo que toca (la acción siguiente).
 */
const DURATION: Record<string, number> = { scan: 3200, home: 4200, sheet: 3200, form: 4600, pending: 3600, live: 4200, album: 3800, songs: 4400 };

export function init(root: HTMLElement): () => void {
  const phone = root.querySelector<HTMLElement>('.pt-phone');
  const btns = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-step-btn]'));
  const finger = root.querySelector<HTMLElement>('[data-finger]');
  if (!phone || !btns.length) return () => {};
  const keys = btns.map((b) => b.dataset.stepBtn!);
  const reduced = prefersReducedMotion();
  let auto = root.dataset.autoplay === '1' && !reduced;
  let visible = false;
  let idx = 0;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const later = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
  const clear = () => { timers.splice(0).forEach(clearTimeout); };

  function type(el: HTMLElement, text: string, every = 45) {
    el.textContent = '';
    if (reduced) { el.textContent = text; return; }
    [...text].forEach((ch, i) => later(300 + i * every, () => { el.textContent += ch; }));
  }
  function tap(target: HTMLElement | null, at: number, then?: () => void) {
    if (!finger || !target || reduced) { if (then) later(at, then); return; }
    later(at, () => {
      const p = phone!.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      finger.style.left = `${r.left - p.left + r.width / 2 - 17}px`;
      finger.style.top = `${r.top - p.top + r.height / 2 - 17}px`;
      finger.style.opacity = '1';
    });
    later(at + 550, () => { finger.classList.remove('is-tap'); void finger.offsetWidth; finger.classList.add('is-tap'); then?.(); });
    later(at + 1100, () => { finger.style.opacity = '0'; });
  }

  function show(i: number) {
    clear();
    idx = (i + keys.length) % keys.length;
    const key = keys[idx];
    btns.forEach((b, j) => b.setAttribute('aria-selected', String(j === idx)));
    const screens = Array.from(phone!.querySelectorAll<HTMLElement>('.pt-screen'));
    screens.forEach((s) => s.classList.toggle('is-on', s.dataset.step === key));
    const scr = screens.find((s) => s.dataset.step === key);
    if (finger) finger.style.opacity = '0';
    if (scr) {
      scr.querySelectorAll<HTMLElement>('[data-type]').forEach((el) => type(el, el.dataset.type ?? '', key === 'songs' ? 70 : 40));
      scr.querySelectorAll<HTMLElement>('.pt-pill[data-pending]').forEach((p) => { p.classList.remove('is-pending'); p.textContent = 'PEDIR'; });
      const target = scr.querySelector<HTMLElement>('[data-tap]');
      const dur = DURATION[key] ?? 3500;
      if (key === 'songs') tap(target, 1600, () => { if (target) { target.classList.add('is-pending'); target.textContent = target.dataset.pending ?? ''; } });
      else tap(target, dur - 1300);
    }
    if (auto && visible) later(DURATION[key] ?? 3500, () => show(idx + 1));
  }

  btns.forEach((b, i) => b.addEventListener('click', () => { auto = false; show(i); }));
  const stopVis = onVisibility(root, (v) => { visible = v; if (v) show(idx); else clear(); });
  show(0);
  return () => { clear(); stopVis(); };
}
