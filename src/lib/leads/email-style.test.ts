import { describe, expect, it } from 'vitest';
import { demoLeadsDb, resetDemoLeads } from './db-demo';
import { createLeadsService } from './service';
import { autoreplyEmail } from './templates';

const base = {
  name: 'Laura', type: 'venue' as const, fields: { venue_name: 'Sala X', city: 'Valencia' }, locale: 'es', signer: 'Ana', brand: 'Enjoy the Club',
  channel: 'email' as const, eta: 'minutes' as const, bookingUrl: 'https://cal.com/enjoy', unsubscribeUrl: 'https://enjoy.ventas.cofundo.io/api/v1/leads/unsubscribe?l=1&t=x',
};

describe('emails con la marca', () => {
  it('sin elegir nada: texto y, al final, «Darme de baja» como enlace (sin la dirección a la vista)', () => {
    const m = autoreplyEmail(base);
    expect(m.html).not.toContain('<table role="presentation" width="100%"');
    expect(m.html).toMatch(/<a href="https:\/\/enjoy\.ventas\.cofundo\.io\/api\/v1\/leads\/unsubscribe\?l=1&amp;t=x" style="color:#888;text-decoration:underline">Darme de baja<\/a><\/p><\/div>$/);
    expect(m.html).not.toContain('>https://enjoy.ventas.cofundo.io/api/v1/leads/unsubscribe');
    expect(m.text).toContain('Si no quieres que te escribamos más: https://enjoy.ventas.cofundo.io/api/v1/leads/unsubscribe');
  });

  it('con la marca: logo, línea del color, enlaces del color y la baja al pie', () => {
    const m = autoreplyEmail({ ...base, style: { mode: 'brand', logoUrl: 'https://enjoytheclub.es/logo.png', color: '#ff27bb' } });
    expect(m.html).toContain('<img src="https://enjoytheclub.es/logo.png" alt="Enjoy the Club" height="36"');
    expect(m.html).toContain('background:#ff27bb');
    expect(m.html).toContain('<a href="https://cal.com/enjoy" style="color:#ff27bb">');
    expect(m.html).toContain('>Darme de baja</a>');
    expect(m.text).toContain('Si no quieres que te escribamos más:'); // la versión en texto sigue igual
  });

  it('sin logo, el nombre; y nada raro entra en el HTML', () => {
    const m = autoreplyEmail({ ...base, style: { mode: 'brand', logoUrl: 'javascript:alert(1)', color: 'red;background:url(x)' } });
    expect(m.html).toContain('<strong');
    expect(m.html).toContain('Enjoy the Club</strong>');
    expect(m.html).not.toContain('javascript');
    expect(m.html).not.toContain('url(x)');
    expect(autoreplyEmail({ ...base, style: { mode: 'brand', logoUrl: 'https://x.com/logo.svg' } }).html).not.toContain('logo.svg');
  });

  it('guardar el diseño: valida el color y el logo; «plain» lo deja como siempre', async () => {
    resetDemoLeads();
    const ENJOY = '00000000-0000-4000-8000-000000000e01';
    const db = demoLeadsDb();
    const svc = createLeadsService(db, { mode: 'demo', session: { tenantId: ENJOY, role: 'admin', userId: 'u', email: 'a@b.c' } } as never);
    await svc.saveEmailStyle({ mode: 'brand', logoUrl: 'https://enjoytheclub.es/logo.png', color: '#FF27BB' });
    expect((await db.settings(ENJOY))?.emailStyle).toEqual({ mode: 'brand', logoUrl: 'https://enjoytheclub.es/logo.png', color: '#ff27bb' });
    await expect(svc.saveEmailStyle({ mode: 'brand', color: 'rosa' })).rejects.toThrow('hexadecimal');
    await expect(svc.saveEmailStyle({ mode: 'brand', logoUrl: 'https://x.com/a.svg' })).rejects.toThrow('PNG o JPG');
    await svc.saveEmailStyle({ mode: 'plain' });
    expect((await db.settings(ENJOY))?.emailStyle).toEqual({});
  });
});

describe('color de la marca legible', async () => {
  const { contrastOnWhite, pickBrandColor } = await import('./templates');
  it('un lima no se lee sobre blanco: enlaces en negro, la línea sigue en lima', () => {
    expect(contrastOnWhite('#e1ff00')).toBeLessThan(3);
    expect(contrastOnWhite('#ff27bb')).toBeGreaterThan(3);
    const m = autoreplyEmail({ ...base, style: { mode: 'brand', color: '#e1ff00' } });
    expect(m.html).toContain('background:#e1ff00');
    expect(m.html).toContain('<a href="https://cal.com/enjoy" style="color:#111111">');
  });
  it('se propone el que se lee', () => {
    expect(pickBrandColor(['#0a0a0a', '#e1ff00'])).toBe('#0a0a0a');
    expect(pickBrandColor([undefined, '#e1ff00', '#ff27bb'])).toBe('#ff27bb');
    expect(pickBrandColor(['#e1ff00'])).toBe('#e1ff00');
    expect(pickBrandColor([])).toBe('#111111');
  });
});
