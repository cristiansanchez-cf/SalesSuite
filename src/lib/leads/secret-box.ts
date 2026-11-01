/**
 * Cifrado de las claves de cada empresa (docs/LEADS.md §Resend): AES-256-GCM con una clave derivada del secreto del
 * servidor (LEADS_SECRET o CRON_SECRET). En la base de datos solo queda «v1:iv:tag:texto», ilegible sin el servidor.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const keyOf = (secret: string) => createHash('sha256').update(`lead-secret:${secret}`).digest();

export function seal(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

/** null si no se puede abrir (otro secreto, manipulada o formato desconocido). */
export function open(sealed: string | null, secret: string): string | null {
  const p = sealed?.split(':');
  if (!p || p.length !== 4 || p[0] !== 'v1') return null;
  try {
    const d = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(p[1], 'base64url'));
    d.setAuthTag(Buffer.from(p[2], 'base64url'));
    return Buffer.concat([d.update(Buffer.from(p[3], 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

/** Lo que se enseña de una clave: el principio y los 4 últimos caracteres. */
export const hintOf = (key: string) => `${key.slice(0, 3)}…${key.slice(-4)}`;
