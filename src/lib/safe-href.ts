/**
 * Enlaces que vienen de datos (web, redes, fuentes de la IA): solo web (http/https), teléfono, email o rutas propias.
 * Cualquier otra cosa («javascript:…», «data:…») no se pinta como enlace (docs/SECURITY_REVIEW.md).
 */
export function safeHref(v: string | null | undefined): string | undefined {
  const s = (v ?? '').trim();
  if (!s) return undefined;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return undefined;
}
