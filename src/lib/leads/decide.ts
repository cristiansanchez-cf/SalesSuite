/**
 * El motivo de «Rechazar» (ficha y bandeja de leads): uno de la lista y, si quieren, un detalle. Con «Otro», el detalle
 * es el motivo (y sin él no hay motivo: setStage lo pide).
 */
export function rejectReason(preset: string, detail: string, other: string): string {
  const p = preset.trim().slice(0, 120);
  const d = detail.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!p || p === other) return d;
  return d ? `${p}: ${d}` : p;
}
