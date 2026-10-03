/**
 * Aperturas internas (docs/ANALYTICS.md §Internas): quién abre el enlace público NO es el cliente si
 * · el navegador tiene sesión de la consola en este dominio (eres tú), o
 * · llega desde una red (IP) desde la que alguien del equipo ha usado la consola esta semana.
 * La IP nunca se guarda en claro: hash SHA-256 con sal por espacio (y IP_HASH_SALT si está definida).
 */
import { createHash } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { env } from '../env';
import { DEMO_COOKIE } from '../admin/auth';
import type { AdminContext } from '../admin/auth';
import { noteDemoTeamIp } from './db-demo';

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = fwd || req.headers.get('x-real-ip')?.trim() || null;
  return ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

export function ipHash(ip: string | null, tenantId: string): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`${env('IP_HASH_SALT') ?? ''}:${tenantId}:${ip}`).digest('hex');
}

/** Hay sesión de la consola en este navegador (cookie de Supabase o de la demo). No hace falta validarla: solo sirve para no contarte a ti. */
export function hasConsoleSession(cookies: AstroCookies, req: Request): boolean {
  if (cookies.get(DEMO_COOKIE)?.value) return true;
  const raw = req.headers.get('cookie') ?? '';
  return /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/.test(raw);
}

// Como mucho una anotación por red y hora en cada instancia del servidor.
const noted = new Map<string, number>();
const HOUR = 3_600_000;

/** La consola anota la red de quien la usa (para no contar sus aperturas del enlace público). Nunca rompe la página. */
export async function noteTeamNetwork(admin: AdminContext, req: Request, tenantId: string, now = Date.now()): Promise<void> {
  const hash = ipHash(clientIp(req), tenantId);
  if (!hash) return;
  const key = `${tenantId}:${hash}`;
  if (now - (noted.get(key) ?? 0) < HOUR) return;
  noted.set(key, now);
  if (noted.size > 5000) noted.clear();
  try {
    if (admin.mode === 'supabase' && admin.supabase) {
      const { error } = await admin.supabase.rpc('note_team_ip', { p_tenant_id: tenantId, p_ip_hash: hash });
      if (error && !/note_team_ip/.test(error.message)) console.error('[team-ip]', error.message);
    } else noteDemoTeamIp(tenantId, hash);
  } catch (e) { console.error('[team-ip]', (e as Error).message); }
}
