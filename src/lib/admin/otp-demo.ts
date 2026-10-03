/**
 * Código de acceso por email en modo DEMO (sin Supabase no hay correo): el código se muestra en pantalla.
 * En Supabase lo envía Auth (signInWithOtp + verifyOtp) con la plantilla supabase/templates/magic_link.html.
 */
import { randomInt } from 'node:crypto';
import { demoDb } from '../data/store';

const TTL_MS = 10 * 60_000;
const MAX_TRIES = 5;
const KEY = Symbol.for('salessuite.demoOtp');
type Entry = { code: string; userId: string; exp: number; tries: number };
const store = (): Map<string, Entry> => ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map()) as Map<string, Entry>;

/** Devuelve el código (solo demo) o null si el email no tiene cuenta. */
export function demoSendCode(email: string): string | null {
  const e = email.trim().toLowerCase();
  const u = demoDb().users.find((x) => x.email.toLowerCase() === e);
  if (!u) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  store().set(e, { code, userId: u.id, exp: Date.now() + TTL_MS, tries: 0 });
  return code;
}

/** userId si el código es válido (un solo uso, 10 min, 5 intentos). */
export function demoVerifyCode(email: string, code: string): string | null {
  const e = email.trim().toLowerCase();
  const entry = store().get(e);
  if (!entry || entry.exp < Date.now() || entry.tries >= MAX_TRIES) { store().delete(e); return null; }
  entry.tries++;
  if (entry.code !== code.trim()) return null;
  store().delete(e);
  return entry.userId;
}
