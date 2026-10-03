import type { APIRoute } from 'astro';
import { z } from 'zod';
import { publicRepository } from '~/lib/data';

/**
 * POST /api/track — visita al enlace público de un dossier (docs/ANALYTICS.md).
 * Lo manda el propio dossier con sendBeacon; solo cuenta si el token es válido para el tenant del dominio.
 * Responde siempre 204 (no revela si el enlace existe).
 */
const Body = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  viewId: z.string().uuid(),
  visitor: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  device: z.enum(['mobile', 'tablet', 'desktop']),
  durationMs: z.number().int().min(0).max(14_400_000),
  scroll: z.number().int().min(0).max(100),
  sections: z.record(z.string().max(64), z.number().int().min(0).max(14_400_000)).refine((o) => Object.keys(o).length <= 60),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const done = new Response(null, { status: 204 });
  if (!locals.tenant) return done;
  const raw = await request.text().catch(() => '');
  if (raw.length > 8_000) return done;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return done; }
  const b = Body.safeParse(parsed);
  if (!b.success) return done;
  const { token, ...input } = b.data;
  try { await publicRepository().trackView(token, locals.tenant.id, input); } catch (e) { console.error('[track]', (e as Error).message); }
  return done;
};
