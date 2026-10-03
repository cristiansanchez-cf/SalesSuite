import type { APIRoute } from 'astro';
import { authenticateKey, ingestDb, json, readJson } from '~/lib/commissions/api';
import { ingest } from '~/lib/commissions/ingest';

/**
 * POST /api/v1/events — ingresos en nuestro formato (docs/COMMISSIONS.md §1).
 *   Authorization: Bearer ss_live_…    Cuerpo: { "source": "pasarela", "events": [ … ] } o directamente [ … ]
 * Idempotente por (source, external_id). Respuesta: { created, duplicates, conflicts, errors }.
 */
export const POST: APIRoute = async ({ request }) => {
  const db = await ingestDb();
  if (db instanceof Response) return db;
  const auth = await authenticateKey(request, db);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const b = body as { source?: unknown; events?: unknown };
  const items = Array.isArray(body) ? body : Array.isArray(b?.events) ? b.events : null;
  if (!items) return json({ error: 'Envía una lista de eventos o { "events": [ … ] }' }, 400);
  const source = typeof b?.source === 'string' ? b.source : 'api';
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(source) || source === 'manual') return json({ error: 'source: minúsculas, números, - y _ (y no «manual»)' }, 400);
  const r = await ingest(db, auth.tenantId, source, items);
  return json(r, r.created + r.duplicates === 0 && (r.errors.length || r.conflicts.length) ? 422 : 200);
};
