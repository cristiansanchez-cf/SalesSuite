import { onVisibility, prefersReducedMotion } from '../runtime';
import { DEMO } from './demo';

/**
 * Por instancia: una pantalla (motor del producto) + el móvil que escanea y pide + la botonera del vendedor.
 * El recorrido va solo mientras se ve; en cuanto alguien toca una pantalla, se queda en ella (▶︎ lo reanuda).
 */
type Scene = { scene: string; amount: number; video?: boolean };
interface Config {
  assets: Record<string, unknown> & { covers: string[] };
  phone: { song?: string; photo?: string; message?: string };
  /** Canciones del estilo del local (sustituyen a las de ejemplo del kit, en el mismo orden que las carátulas). */
  songs?: Array<{ song: string; artist: string }>;
  /** Su propia foto (Personalizar): el móvil la enseña al enviarla. */
  ownPhoto?: string | null;
  autoplay: boolean;
  scenes: Scene[];
}
interface Screen { show(scene: string, data?: Record<string, unknown>): void; set(k: string, v: unknown): void; destroy(): void }

/** Carátula de color con el título cuando no hay carátulas reales (mejor que un marcador vacío en un dossier). */
function coverFor(title: string, i: number): string {
  const pairs = [['#ff27bb', '#6d28d9'], ['#fb873c', '#ff27bb'], ['#e1ff00', '#0ea5a4']][i % 3];
  // Un vinilo sobre el degradado: se lee como «carátula» sin inventar portadas.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pairs[0]}"/><stop offset="1" stop-color="${pairs[1]}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="200" r="120" fill="rgba(0,0,0,.55)"/><circle cx="200" cy="200" r="95" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="2"/><circle cx="200" cy="200" r="70" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="2"/><circle cx="200" cy="200" r="34" fill="${pairs[0]}"/><circle cx="200" cy="200" r="5" fill="#08030c"/></svg>`;
  void title;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

let engineReady: Promise<(el: HTMLElement, o?: Record<string, unknown>) => Screen> | null = null;
function loadEngine(cfg: Config) {
  // El motor lee ASSETS/DEMO al cargarse: se ponen antes (los del espacio; mismas para todas las pantallas de la página).
  const w = window as unknown as Record<string, unknown>;
  if (!engineReady) {
    const BY = ['Laura', 'Marc', 'Ana', 'Jorge', 'Lucía', 'Dani'];
    const DED = ['¡Va por Marta, feliz cumple! 🎉', '', 'Para la mesa 7, que no para 🔥', '', 'La nuestra 💃', ''];
    const songs = cfg.songs?.length
      ? cfg.songs.map((x, i) => ({ ...x, by: BY[i % BY.length], dedication: DED[i % DED.length] }))
      : DEMO.songs;
    const ranking = cfg.songs?.length ? cfg.songs.map((x, i) => ({ ...x, votes: [12, 8, 5, 3, 2, 1][i] ?? 1 })) : DEMO.ranking;
    w.ASSETS = { ...cfg.assets, covers: cfg.assets.covers.length ? cfg.assets.covers : songs.map((s, i) => coverFor(s.song, i)) };
    w.DEMO = { ...DEMO, songs, ranking };
    engineReady = import('./engine.js').then(() => w.EnjoyScreen as (el: HTMLElement, o?: Record<string, unknown>) => Screen);
  }
  return engineReady;
}

const isRequest = (scene: string) => /\.(song|photo|message|full)$/.test(scene) || scene === 'club.toast';
const phoneKey = (scene: string): 'song' | 'photo' | 'message' => (/photo|full/.test(scene) ? 'photo' : /message/.test(scene) ? 'message' : 'song');

export function init(root: HTMLElement): () => void {
  const cfgEl = root.querySelector<HTMLScriptElement>('script[data-config]');
  const stage = root.querySelector<HTMLElement>('[data-stage]');
  if (!cfgEl || !stage) return () => {};
  const cfg = JSON.parse(cfgEl.textContent || '{}') as Config;
  const btns = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-scene-btn]'));
  const play = root.querySelector<HTMLButtonElement>('[data-play]');
  const says = root.querySelector<HTMLElement>('[data-says]');
  const saysList = JSON.parse(root.querySelector('template[data-says-list]')?.innerHTML || '[]') as string[];
  const phone = root.querySelector<HTMLElement>('[data-phone]');
  const phoneImg = root.querySelector<HTMLImageElement>('[data-phone-img]');
  const reduced = prefersReducedMotion();

  let screen: Screen | null = null;
  let idx = 0;
  let auto = cfg.autoplay && !reduced;
  let visible = false;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const later = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
  const clear = () => { timers.splice(0).forEach(clearTimeout); };
  const phoneState = (...cls: string[]) => { if (phone) phone.className = ['live-screen__phone', ...cls].join(' '); };

  function mark(i: number) {
    btns.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    if (says) says.textContent = saysList[i] ?? '';
  }

  /** Enseña la pantalla i. Si es una petición, antes el móvil escanea el QR y la envía. */
  function go(i: number, withPhone: boolean) {
    clear();
    idx = (i + cfg.scenes.length) % cfg.scenes.length;
    const s = cfg.scenes[idx];
    mark(idx);
    const show = () => { screen?.set('amount', s.amount); screen?.show(s.scene); };
    if (s.video && withPhone && !reduced && phone) {
      // Su vídeo: el móvil lo sube (barra), desaparece y el vídeo aparece de fondo en la pantalla.
      phoneState('is-in', 'is-upload');
      later(1800, () => phoneState('is-in', 'is-upload', 'is-sent'));
      later(2300, () => { phoneState(); show(); });
    } else if (!withPhone || reduced || !phone || !isRequest(s.scene)) { phoneState(); show(); }
    else if (phoneKey(s.scene) === 'photo' && cfg.ownPhoto) {
      if (phoneImg) phoneImg.src = cfg.ownPhoto;
      phoneState('is-in', 'is-scan');
      later(1100, () => phoneState('is-in', 'is-own'));
      later(2200, () => phoneState('is-in', 'is-own', 'is-sent'));
      later(2700, show);
      later(4200, () => phoneState());
    } else {
      const src = cfg.phone[phoneKey(s.scene)];
      if (phoneImg && src) phoneImg.src = src;
      phoneState('is-in', 'is-scan');
      later(1100, () => phoneState('is-in', src ? 'is-app' : 'is-scan'));
      later(2200, () => phoneState('is-in', src ? 'is-app' : '', 'is-sent'));
      later(2700, show);
      later(4200, () => phoneState());
    }
    const lead = s.video ? 2300 : isRequest(s.scene) ? 2700 : 0;
    if (auto && visible) later(lead + (s.video ? 7000 : s.scene.endsWith('idle') ? 4500 : 6000), () => go(idx + 1, true));
  }

  function setAuto(on: boolean) {
    auto = on && !reduced;
    play?.setAttribute('aria-pressed', String(auto));
    if (auto && visible) go(idx + 1, true); else clear();
  }

  btns.forEach((b, i) => b.addEventListener('click', () => { auto = false; play?.setAttribute('aria-pressed', 'false'); go(i, true); }));
  play?.addEventListener('click', () => setAuto(!auto));

  let alive = true;
  loadEngine(cfg).then((EnjoyScreen) => {
    if (!alive) return;
    screen = EnjoyScreen(stage, { scene: cfg.scenes[0].scene });
    go(0, false);
  });
  const stopVis = onVisibility(root, (v) => {
    visible = v;
    if (!screen) return;
    if (v && auto) go(idx, false); else clear();
  });

  return () => { alive = false; clear(); stopVis(); screen?.destroy(); };
}
