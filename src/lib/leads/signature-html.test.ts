import { describe, expect, it } from 'vitest';
import { sanitizeSignatureHtml, signatureHtmlToText } from './signature-html';
import { autoreplyEmail } from './templates';

const GMAIL = `<div dir="ltr"><table cellpadding="0" cellspacing="0" style="font-family:Arial;color:#333"><tbody><tr>
<td style="padding-right:12px"><img src="https://lh3.googleusercontent.com/logo.png" width="80" height="80" alt="Logo"></td>
<td><b style="font-size:16px">Ana López</b><br><span style="color:#888">Directora · Enjoy the Club</span><br>
<a href="tel:+34600123123" style="color:#1a56db">+34 600 123 123</a><br><a href="https://enjoytheclub.es">enjoytheclub.es</a></td>
</tr></tbody></table><div><br></div></div>`;

describe('firma pegada: se limpia', () => {
  it('conserva la tabla, el texto, los enlaces y la imagen por https', () => {
    const { html, droppedImages } = sanitizeSignatureHtml(GMAIL);
    expect(droppedImages).toBe(0);
    expect(html).toContain('<table cellpadding="0" cellspacing="0" style="font-family:Arial;color:#333">');
    expect(html).toContain('<img src="https://lh3.googleusercontent.com/logo.png" width="80" height="80" alt="Logo">');
    expect(html).toContain('<a href="tel:+34600123123" style="color:#1a56db">+34 600 123 123</a>');
    expect(html).not.toContain('dir=');
  });

  it('quita lo peligroso', () => {
    const { html } = sanitizeSignatureHtml(`<div onclick="x()">Hola<script>alert(1)</script><style>p{}</style>
      <a href="javascript:alert(1)">mal</a><img src="https://x.com/a.png" onerror="x()">
      <span style="color:red;background:url(https://evil/x);position:fixed">rojo</span><iframe src="https://x"></iframe></div>`);
    expect(html).not.toMatch(/script|onclick|onerror|javascript|iframe|url\(|position|<style/i);
    expect(html).toContain('mal'); // el enlace malo se queda en texto
    expect(html).toContain('<span style="color:red">rojo</span>');
  });

  it('cuenta las imágenes pegadas desde el ordenador (no se ven en un email)', () => {
    const r = sanitizeSignatureHtml('<p>Ana</p><img src="data:image/png;base64,AAAA"><img src="cid:image001.png@01D">');
    expect(r.droppedImages).toBe(2);
    expect(r.html).toBe('<p>Ana</p>');
  });

  it('vacío si no queda nada', () => {
    expect(sanitizeSignatureHtml('<div><br></div><p> </p>').html).toBe('');
    expect(sanitizeSignatureHtml('<script>x</script>').html).toBe('');
  });

  it('el texto plano tiene las líneas y los datos', () => {
    const t = signatureHtmlToText(sanitizeSignatureHtml(GMAIL).html);
    expect(t).toContain('Ana López');
    expect(t).toContain('Directora · Enjoy the Club');
    expect(t).toContain('+34 600 123 123');
    expect(t).toContain('enjoytheclub.es');
    expect(t).not.toContain('<');
  });

  it('el email usa la firma pegada en HTML y en texto', () => {
    const { html: sig } = sanitizeSignatureHtml(GMAIL);
    const m = autoreplyEmail({
      name: 'Laura', type: 'venue', fields: { venue_name: 'Sala X', city: 'Valencia' }, locale: 'es', signer: 'Ana', brand: 'Enjoy',
      channel: 'email', eta: 'minutes', bookingUrl: null, unsubscribeUrl: null, signature: { html: sig, htmlText: signatureHtmlToText(sig) },
    });
    expect(m.html).toContain('lh3.googleusercontent.com/logo.png');
    expect(m.text).toContain('Directora · Enjoy the Club');
  });
});
