import { init as reveal } from '../deck/client';

/** Recalcula al cambiar el tipo, los clientes o el ticket. */
export function init(root: HTMLElement): () => void {
  const stop = reveal(root);
  const d = root.dataset;
  const money = new Intl.NumberFormat(d.loc || 'es-ES', { style: 'currency', currency: d.cur || 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions);
  const out = root.querySelector<HTMLElement>('[data-out]');
  const outYear = root.querySelector<HTMLElement>('[data-out-year]');
  const qty = root.querySelector<HTMLInputElement>('[data-qty]');
  const qtyOut = root.querySelector<HTMLElement>('[data-qty-out]');
  const ticket = root.querySelector<HTMLInputElement>('[data-ticket]');
  const calc = () => {
    if (!out) return;
    if (d.kind === 'stake') {
      const post = Number(d.post) || 0; const v = Number(ticket?.value) || 0;
      out.textContent = post ? `${((100 * v) / post).toLocaleString(d.loc || 'es-ES', { maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)}%` : '—';
      return;
    }
    const price = Number(root.querySelector<HTMLInputElement>('[data-opt]:checked')?.value) || 0;
    const n = Number(qty?.value) || 0;
    if (qtyOut) qtyOut.textContent = String(n);
    const lo = (price * n * Number(d.rmin)) / 100, hi = (price * n * Number(d.rmax)) / 100;
    out.textContent = `${money.format(lo)} – ${money.format(hi)}`;
    if (outYear) outYear.textContent = `${money.format(lo * 12)} – ${money.format(hi * 12)}`;
  };
  root.addEventListener('input', calc); root.addEventListener('change', calc);
  calc();
  return () => { stop(); root.removeEventListener('input', calc); root.removeEventListener('change', calc); };
}
