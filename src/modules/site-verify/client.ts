/**
 * site-verify: la escena, una vez al verse la diapositiva. Aparece el sello (o los sellos) → el cursor va al que se
 * pulsa → lo pulsa → la barra pasa a sciscreen.com y se abre la página del sello → baja a las afirmaciones. Con una frase
 * en cada momento. El sello se pulsa también a mano; «←» vuelve a su web; «Volver a verlo» repite la escena.
 * Sin animaciones (prefers-reduced-motion): la página del sello, abierta.
 * Los sellos miden lo que medirían instalados: --k = ancho de la captura / 1440 (como poco 0,45, para que se lean).
 */
import { onVisibility } from '../runtime';

export function init(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('.sv-stage')!;
  const page = root.querySelector<HTMLElement>('.sv-page')!;
  const seals = [...root.querySelectorAll<HTMLButtonElement>('.sv-seal')];
  const target = root.querySelector<HTMLButtonElement>('.sv-seal--target') ?? seals[0];
  const ss = root.querySelector<HTMLElement>('.sv-ss')!;
  const scroller = root.querySelector<HTMLElement>('[data-sv-scroll]');
  const claims = root.querySelector<HTMLElement>('[data-sv-claims]');
  const caption = root.querySelector<HTMLElement>('[data-sv-caption]');
  const backs = [...root.querySelectorAll<HTMLButtonElement>('[data-sv-back]')];
  const replay = root.querySelector<HTMLButtonElement>('[data-sv-replay]');
  const lines = JSON.parse(stage.dataset.captions ?? '{}') as Record<'start' | 'seal' | 'click' | 'page', string>;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let played = false;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const at = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
  const step = (s: string) => { stage.dataset.step = s; };

  const say = (text: string) => {
    if (!caption || caption.textContent === text) return;
    caption.classList.add('is-out');
    at(220, () => { caption.textContent = text; caption.classList.remove('is-out'); });
  };
  // Dónde está el sello que se pulsa (para el cursor y para «Pulsa el sello»), relativo a la captura.
  const place = () => {
    const w = page.clientWidth;
    page.style.setProperty('--k', String(Math.max(w / 1440, 0.45)));
    const p = page.getBoundingClientRect(), r = target.getBoundingClientRect();
    if (!r.width) return;
    // «Pulsa el sello», al lado del sello (a la derecha; a la izquierda si no cabe), sin tapar la página.
    const right = r.right + 150 < p.right;
    page.style.setProperty('--hx', `${(right ? r.right + 10 : r.left - 10) - p.left}px`);
    page.style.setProperty('--hdx', right ? '0' : '-100%');
    page.style.setProperty('--hy', `${r.top - p.top + r.height / 2}px`);
    // El foco, centrado en el sello y un poco más grande que él.
    page.style.setProperty('--fx', `${r.left - p.left + r.width / 2}px`);
    page.style.setProperty('--fy', `${r.top - p.top + r.height / 2}px`);
    page.style.setProperty('--fr', `${Math.max(r.width, r.height) / 2 + 24}px`);
    return { x: r.left - p.left + r.width * 0.3, y: r.top - p.top + r.height * 0.55 };
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null;
  ro?.observe(page);
  place();

  const open = (v: boolean) => {
    ss.dataset.open = v ? '1' : '0';
    stage.classList.toggle('is-open', v);
    seals.forEach((s) => s.setAttribute('aria-expanded', String(v)));
    backs.forEach((b) => { b.tabIndex = v ? 0 : -1; });
    if (v && scroller) scroller.scrollTop = 0;
  };
  const showClaims = () => { if (scroller && claims && scroller.scrollHeight > scroller.clientHeight + 4) scroller.scrollTo({ top: claims.offsetTop - 12, behavior: reduce ? 'auto' : 'smooth' }); };

  function play() {
    clear(); open(false);
    page.style.removeProperty('--cx'); page.style.removeProperty('--cy');
    if (reduce) { step('done'); open(true); say(lines.page); return; }
    step('idle'); say(lines.start);
    at(1100, () => { step('seal'); say(lines.seal); });
    at(3400, () => {
      const pt = place();
      if (pt) { page.style.setProperty('--cx', `${pt.x}px`); page.style.setProperty('--cy', `${pt.y}px`); }
      step('move'); say(lines.click);
    });
    at(5000, () => step('press'));
    at(5450, () => { step('done'); open(true); say(lines.page); });
    at(7600, showClaims);
  }

  const onSeal = () => { clear(); step('done'); open(true); say(lines.page); at(900, showClaims); };
  const onBack = () => { clear(); open(false); step('done'); say(lines.seal); target.focus(); };
  const onReplay = () => play();
  seals.forEach((s) => s.addEventListener('click', onSeal));
  backs.forEach((b) => b.addEventListener('click', onBack));
  replay?.addEventListener('click', onReplay);
  const stop = onVisibility(root, (visible) => { if (visible && !played) { played = true; play(); } }, 0.35);
  return () => {
    clear(); stop(); ro?.disconnect();
    seals.forEach((s) => s.removeEventListener('click', onSeal));
    backs.forEach((b) => b.removeEventListener('click', onBack));
    replay?.removeEventListener('click', onReplay);
  };
}
