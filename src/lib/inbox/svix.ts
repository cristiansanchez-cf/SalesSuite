/**
 * Firma de los webhooks de Resend (Svix): HMAC-SHA256 de «id.timestamp.cuerpo» con el secreto («whsec_<base64>»), en
 * la cabecera svix-signature («v1,<firma> v1,<otra>»). Se rechaza si la marca de tiempo está a más de 5 minutos.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function signSvix(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

export function verifySvix(secret: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, body: string, now = Date.now()): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const want = Buffer.from(signSvix(secret, id, timestamp, body));
  return signature.split(' ').some((part) => {
    const [ver, sig] = part.split(',');
    if (ver !== 'v1' || !sig) return false;
    const got = Buffer.from(sig);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}
