import { describe, expect, it } from 'vitest';
import { connectPrompt, connectSnippet } from './connect-guide';
import { parseLead } from './contract';
import { normalizeOrigin, originAllowed } from './cors';

const g = { endpoint: 'https://acme.ventas.cofundo.io/api/v1/leads', brand: 'acme', origins: ['https://acme.com'], locale: 'es' as const };

describe('lo que se le pasa a quien hace la web', () => {
  it('el ejemplo del prompt cumple el contrato', () => {
    const p = connectPrompt(g);
    const json = p.slice(p.indexOf('{'), p.indexOf('\n}\n') + 2);
    const body = JSON.parse(json);
    body.idempotency_key = 'k-1';
    const r = parseLead(body);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lead).toMatchObject({ brand: 'acme', type: 'general', test: true, email: 'ana@empresa.com' });
  });

  it('lleva la dirección, la marca, las webs y los tipos', () => {
    for (const locale of ['es', 'en'] as const) {
      const p = connectPrompt({ ...g, locale });
      expect(p).toContain('POST https://acme.ventas.cofundo.io/api/v1/leads');
      expect(p).toContain('"acme"');
      expect(p).toContain('https://acme.com');
      expect(p).toContain('event_type*');
    }
    expect(connectPrompt({ ...g, origins: [] })).toContain('todavía ninguna');
  });

  it('el código usa la dirección y la marca', () => {
    const s = connectSnippet(g);
    expect(s).toContain("fetch('https://acme.ventas.cofundo.io/api/v1/leads'");
    expect(s).toContain("brand: 'acme'");
  });
});

describe('webs permitidas: lo que escribe la persona → el origen', () => {
  it.each([
    ['enjoytheclub.es', 'https://enjoytheclub.es'],
    ['  https://www.Enjoytheclub.es/es/contacto?x=1 ', 'https://www.enjoytheclub.es'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['https://corporativeweb-b0ce4--*.web.app', 'https://corporativeweb-b0ce4--*.web.app'],
    ['web.com:8443/', 'https://web.com:8443'],
  ])('%s → %s', (a, b) => expect(normalizeOrigin(a)).toBe(b));

  it.each(['', 'hola', '*.com', 'https://*.web.app', 'ftp://web.com', 'https://web.*', 'https://-a.com', 'mailto:a@b.com'])('rechaza «%s»', (a) => {
    expect(normalizeOrigin(a)).toBeNull();
  });

  it('lo normalizado sigue funcionando con la lista blanca', () => {
    const o = normalizeOrigin('corporativeweb-b0ce4--*.web.app')!;
    expect(originAllowed('https://corporativeweb-b0ce4--pr12-abc.web.app', [o])).toBe(true);
    expect(originAllowed('https://otro.web.app', [o])).toBe(false);
  });
});
