/**
 * CORS del endpoint de leads (docs/LEADS.md §CORS). Lista blanca por espacio: orígenes exactos o con un comodín en el
 * subdominio («https://corporativeweb-b0ce4--*.web.app» = los previews de ese sitio, no cualquier *.web.app).
 * Desde localhost se admite siempre, pero lo que llega de ahí se guarda como prueba y nunca envía nada.
 */
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/;

export const isLocalOrigin = (origin: string) => LOCAL.test(origin);

function patternToRegex(p: string): RegExp | null {
  const m = /^(https?:\/\/)([^/]+)$/.exec(p.trim().toLowerCase());
  if (!m) return null;
  const host = m[2].split('.').map((part) => part.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+')).join('\\.');
  return new RegExp(`^${m[1].replace(/\//g, '\\/')}${host}$`);
}

export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  const o = origin.trim().toLowerCase();
  if (isLocalOrigin(o)) return true;
  return allowed.some((p) => patternToRegex(p)?.test(o) ?? false);
}

export function corsHeaders(origin: string | null, ok: boolean): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' };
  if (ok && origin) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}
