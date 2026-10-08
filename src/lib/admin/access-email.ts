/**
 * Emails de acceso (código para entrar e invitación) enviados por nuestro Resend en vez del correo de Supabase Auth:
 * no dependen de sus límites de envío, se ven en el panel de Resend y avisan también a quien ya tenía cuenta.
 * Estilo: supabase/templates (fondo #faf9f7, tarjeta blanca, botón #1a1a1a).
 */
import type { Email } from '../notify/mailer';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px"><tr><td style="padding:32px">
<h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:#1a1a1a">${esc(title)}</h1>
${body}
</td></tr></table></td></tr></table></body></html>`;
}
const p = (t: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 16px;color:#4a4a4a">${t}</p>`;
const codeBlock = (code: string) => `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 24px;color:#1a1a1a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${esc(code)}</p>`;
const button = (href: string, label: string, primary = true) =>
  `<p style="margin:0 0 24px"><a href="${esc(href)}" style="display:inline-block;background:${primary ? '#1a1a1a' : '#f4f2ef'};color:${primary ? '#ffffff' : '#1a1a1a'};text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${esc(label)}</a></p>`;
const small = (t: string) => `<p style="font-size:13px;line-height:1.5;color:#8a8a8a;margin:0">${t}</p>`;

/** Código para entrar (lo que pide la pantalla de acceso). */
export function loginCodeEmail(to: string, a: { code: string; link: string; space: string }): Email {
  const title = 'Tu código para entrar';
  return {
    to, tag: 'login-code', subject: `${a.code} es tu código para entrar en ${a.space}`,
    html: layout(title, p('Escribe este código en la pantalla de acceso:') + codeBlock(a.code)
      + p('También puedes entrar con el botón desde este mismo dispositivo. Caduca en una hora y solo funciona una vez.')
      + button(a.link, 'Entrar con un clic', false) + small('Si no lo has pedido tú, ignora este correo.')),
    text: `${title}: ${a.code}\n\nO entra con este enlace (caduca en una hora): ${a.link}\n\nSi no lo has pedido tú, ignora este correo.`,
  };
}

/** Invitación (o aviso de acceso nuevo para quien ya tenía cuenta en otro espacio). */
export function inviteEmail(to: string, a: { link: string; loginUrl: string; space: string; existing: boolean }): Email {
  const title = a.existing ? `Ya tienes acceso a ${a.space}` : `Te han invitado a ${a.space}`;
  return {
    to, tag: 'invite', subject: title,
    html: layout(title, p(a.existing ? 'Te han dado acceso a este espacio. Entra con el botón:' : 'Pulsa el botón para entrar. No necesitas contraseña.')
      + button(a.link, 'Entrar')
      + p(`Las próximas veces, entra en <a href="${esc(a.loginUrl)}" style="color:#1a1a1a">${esc(a.loginUrl.replace(/^https?:\/\//, ''))}</a> con tu email y te enviaremos un código.`)
      + small('El botón caduca en una hora. Si ha caducado, entra con tu email y te mandamos un código. Si no esperabas este correo, puedes ignorarlo.')),
    text: `${title}\n\nEntra con este enlace (caduca en una hora): ${a.link}\n\nLas próximas veces: ${a.loginUrl} con tu email y te enviaremos un código.`,
  };
}
