import { onVisibility, prefersReducedMotion } from '../runtime';

/**
 * Por instancia: escala la consola (1180 × 640, o 720 de ancho en compacto) al hueco, cambia de vista con las
 * pastillas y la pasa sola mientras se ve y nadie la ha tocado (se para para siempre al primer toque).
 */
export function init(root: HTMLElement): () => void {
  const viewport = root.querySelector<HTMLElement>('[data-viewport]');
  const app = root.querySelector<HTMLElement>('[data-app]');
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-show]'));
  if (!viewport || !app || !tabs.length) return () => {};
  const views = Array.from(root.querySelectorAll<HTMLElement>('[data-view]'));
  const navs = Array.from(root.querySelectorAll<HTMLElement>('[data-nav]'));
  const says = Array.from(root.querySelectorAll<HTMLElement>('[data-says]'));
  const every = prefersReducedMotion() ? 0 : Number(root.dataset.autoplay) || 0;

  let active = 0;
  let touched = false;
  let visible = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fit = () => {
    const w = viewport.clientWidth || 1;
    // Compacto solo en móvil (como la app por debajo de 1024); en un portátil bajo, la consola entera, más pequeña.
    const compact = w < 640 && window.innerWidth < 760;
    app.classList.toggle('is-compact', compact);
    const designW = compact ? 720 : 1180;
    const s = Math.min(1, w / designW);
    viewport.style.setProperty('--s', String(s));
  };

  const show = (i: number) => {
    active = (i + tabs.length) % tabs.length;
    const tab = tabs[active];
    const view = tab.dataset.show;
    const nav = tab.dataset.navTarget;
    tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === active)));
    views.forEach((v) => v.classList.toggle('is-on', v.dataset.view === view));
    navs.forEach((n) => n.classList.toggle('is-on', n.dataset.nav === nav));
    says.forEach((x) => { x.hidden = x.dataset.says !== view; });
    schedule();
  };

  const schedule = () => {
    clearTimeout(timer);
    if (every > 0 && visible && !touched && tabs.length > 1) timer = setTimeout(() => show(active + 1), every);
  };

  const onTab = (e: Event) => {
    touched = true;
    show(tabs.indexOf(e.currentTarget as HTMLButtonElement));
  };
  tabs.forEach((t) => t.addEventListener('click', onTab));
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(viewport);
  fit();
  show(0);
  const stopVis = onVisibility(root, (v) => { visible = v; schedule(); });

  return () => {
    clearTimeout(timer);
    tabs.forEach((t) => t.removeEventListener('click', onTab));
    ro?.disconnect();
    stopVis();
  };
}
