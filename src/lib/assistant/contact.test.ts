import { afterEach, describe, expect, it } from 'vitest';
import { clearNumberCache, displayNumber, samePhone, waLinkFor } from './contact';

afterEach(() => clearNumberCache());

describe('a qué número escribe el equipo', () => {
  it('pide a Meta el número visible y lo guarda una hora', async () => {
    let calls = 0;
    const f = (async (u: string, init?: RequestInit) => {
      calls++;
      expect(u).toBe('https://graph.facebook.com/v25.0/1493985227120621?fields=display_phone_number');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return new Response(JSON.stringify({ display_phone_number: '+34 694 90 41 49' }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await displayNumber('1493985227120621', 'tok', f, 0)).toBe('+34 694 90 41 49');
    expect(await displayNumber('1493985227120621', 'tok', f, 60_000)).toBe('+34 694 90 41 49');
    expect(calls).toBe(1);
    await displayNumber('1493985227120621', 'tok', f, 3_700_000);
    expect(calls).toBe(2);
  });

  it('sin token o con un id raro no llama', async () => {
    const f = (async () => { throw new Error('no'); }) as unknown as typeof fetch;
    expect(await displayNumber('123456', undefined, f)).toBeNull();
    expect(await displayNumber('../x', 'tok', f)).toBeNull();
  });

  it('el enlace de WhatsApp y comparar teléfonos con o sin prefijo', () => {
    expect(waLinkFor('+34 694 90 41 49')).toBe('https://wa.me/34694904149?text=Hola');
    expect(waLinkFor(null)).toBeNull();
    expect(samePhone('+34 694 90 41 49', '694904149')).toBe(true);
    expect(samePhone('+34727743567', '+34 694 90 41 49')).toBe(false);
    expect(samePhone('', '694904149')).toBe(false);
  });
});
