import { describe, expect, test } from 'vitest';
import { inviteEmail, loginCodeEmail } from './access-email';

describe('emails de acceso por Resend', () => {
  test('código para entrar: el código en el asunto y en grande, y el enlace de un clic', () => {
    const e = loginCodeEmail('ana@club.test', { code: '482913', link: 'https://enjoy.ventas.cofundo.io/admin/auth/confirm?type=magiclink&token_hash=abc&next=%2Fadmin', space: 'Enjoy the Club' });
    expect(e.subject).toBe('482913 es tu código para entrar en Enjoy the Club');
    expect(e.html).toContain('482913');
    expect(e.html).toContain('token_hash=abc&amp;next=%2Fadmin');
    expect(e.text).toContain('482913');
    expect(e.tag).toBe('login-code');
  });
  test('invitación: nueva o aviso a quien ya tenía cuenta, sin HTML colado', () => {
    const nueva = inviteEmail('ana@club.test', { link: 'https://x.test/a', loginUrl: 'https://x.test/admin/login', space: 'Enjoy <b>', existing: false });
    expect(nueva.subject).toBe('Te han invitado a Enjoy <b>');
    expect(nueva.html).toContain('Enjoy &lt;b&gt;');
    expect(nueva.html).toContain('x.test/admin/login');
    expect(inviteEmail('ana@club.test', { link: 'https://x.test/a', loginUrl: 'https://x.test/admin/login', space: 'Oquea', existing: true }).subject).toBe('Ya tienes acceso a Oquea');
  });
});
