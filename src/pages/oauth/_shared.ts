/** Respuestas de los puntos OAuth (docs/MCP.md §OAuth): JSON, sin caché y con CORS abierto (sin cookies). */
export const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version' };
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', pragma: 'no-cache', ...CORS } });
export const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);
/** El cuerpo como objeto: form-urlencoded (lo normal en /token) o JSON. Como mucho 64 KB. */
export async function bodyOf(req: Request): Promise<Record<string, string> | null> {
  if (Number(req.headers.get('content-length') ?? 0) > 65536) return null;
  const type = req.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) { const v = await req.json(); return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x : JSON.stringify(x)])) : null; }
    return Object.fromEntries(new URLSearchParams(await req.text()));
  } catch { return null; }
}
