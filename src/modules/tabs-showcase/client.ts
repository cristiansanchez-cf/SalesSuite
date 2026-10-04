import { onVisibility, prefersReducedMotion } from '../runtime';

/**
 * Por instancia (antes: document.querySelector('.nh-tabs') + un único data-active + un timer global).
 * Aquí cada root tiene su índice activo, su timer y su barra de progreso.
 */
export function init(root: HTMLElement): () => void {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  if (!tabs.length) return () => {};

  const every = prefersReducedMotion() ? 0 : Number(root.dataset.autoAdvance) || 0;
  let active = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let visible = false;
  let hovering = false;

  const select = (n: number, focus = false) => {
    active = (n + tabs.length) % tabs.length;
    tabs.forEach((t, i) => {
      const on = i === active;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      // Reinicia la animación de progreso de la pestaña activa.
      const bar = t.querySelector<HTMLElement>('[data-progress]');
      if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    });
    panels.forEach((p, i) => { p.hidden = i !== active; p.toggleAttribute('data-active', i === active); });
    if (focus) tabs[active].focus();
    schedule();
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = undefined;
    const running = every > 0 && visible && !hovering;
    root.toggleAttribute('data-running', running);
    if (running) timer = setTimeout(() => select(active + 1), every);
  };

  const onClick = (e: Event) => {
    const i = tabs.indexOf((e.currentTarget as HTMLButtonElement));
    if (i >= 0) select(i);
  };
  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, number> = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: tabs.length - 1 };
    if (e.key in map) { e.preventDefault(); select(map[e.key], true); }
  };
  // Pausa solo al apuntar a la barra de pestañas (la sección es full-width: pausar en toda ella
  // dejaría el auto-advance parado casi siempre) o con foco de teclado dentro del módulo.
  const tablist = root.querySelector<HTMLElement>('[role="tablist"]') ?? root;
  const enter = (e: Event) => { if ((e as PointerEvent).pointerType === 'touch') return; hovering = true; schedule(); };
  const leave = () => { hovering = false; schedule(); };
  const focusIn = (e: FocusEvent) => {
    let keyboard = true;
    try { keyboard = (e.target as Element).matches(':focus-visible'); } catch { /* navegador sin :focus-visible */ }
    if (keyboard) { hovering = true; schedule(); }
  };

  tabs.forEach((t) => { t.addEventListener('click', onClick); t.addEventListener('keydown', onKey); });
  tablist.addEventListener('pointerenter', enter);
  tablist.addEventListener('pointerleave', leave);
  root.addEventListener('focusin', focusIn);
  root.addEventListener('focusout', leave);
  const stopVis = onVisibility(root, (v) => { visible = v; schedule(); });

  // Presentación: la flecha «siguiente» pasa antes por cada pestaña (y «anterior», hacia atrás).
  const onDeckStep = (e: Event) => {
    const dir = (e as CustomEvent<{ dir: number }>).detail.dir;
    const to = active + dir;
    if (to >= 0 && to < tabs.length) { e.preventDefault(); select(to); }
  };
  root.setAttribute('data-deck-step', '');
  root.addEventListener('deck:step', onDeckStep);

  root.style.setProperty('--tabs-every', `${every}ms`);
  select(0);

  return () => {
    clearTimeout(timer);
    stopVis();
    tabs.forEach((t) => { t.removeEventListener('click', onClick); t.removeEventListener('keydown', onKey); });
    tablist.removeEventListener('pointerenter', enter);
    tablist.removeEventListener('pointerleave', leave);
    root.removeEventListener('focusin', focusIn);
    root.removeEventListener('focusout', leave);
    root.removeEventListener('deck:step', onDeckStep);
  };
}
