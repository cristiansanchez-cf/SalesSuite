import { init as reveal } from '../deck/client';

/** «Ver solo lo nuestro»: atenúa las columnas de la competencia. */
export function init(root: HTMLElement): () => void {
  const stop = reveal(root);
  const btn = root.querySelector<HTMLButtonElement>('[data-only-us]');
  const h = () => { const on = !root.hasAttribute('data-only-us-on'); root.toggleAttribute('data-only-us-on', on); btn?.setAttribute('aria-pressed', String(on)); };
  btn?.addEventListener('click', h);
  return () => { stop(); btn?.removeEventListener('click', h); };
}
