import type { APIRoute } from 'astro';
import { authenticateKey, ingestDb, json, readJson } from '~/lib/commissions/api';
import { applyMapping, ingest, parseMapping } from '~/lib/commissions/ingest';

/**
 * POST /api/v1/ingest/<conector> — el formato de una API externa tal cual; el mapeo del conector lo convierte
 * a eventos (docs/COMMISSIONS.md §1, «enrutamiento»). El origen de los eventos es la clave del conector.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const db = await ingestDb();
  if (db instanceof Response) return db;
  const auth = await authenticateKey(request, db);
  if (auth instanceof Response) return auth;
  const c = await db.connector(auth.tenantId, String(params.connector ?? ''));
  if (!c) return json({ error: 'Conector no encontrado o desactivado' }, 404);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  let items: unknown[];
  try { items = applyMapping(parseMapping(c.mapping), body); } catch (e) { return json({ error: `Mapeo: ${e instanceof Error ? e.message : e}` }, 500); }
  const r = await ingest(db, auth.tenantId, c.key, items);
  return json(r, r.created + r.duplicates === 0 && (r.errors.length || r.conflicts.length) ? 422 : 200);
};
