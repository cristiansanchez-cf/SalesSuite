import { describe, expect, test } from 'vitest';
import { deepMerge, interpolate, resolveItem } from './resolve';
import type { PublicDossier, RenderItem } from '~/lib/types';

const dossier: PublicDossier = {
  id: 'd', tenantId: 't', title: 'T', prospectName: 'Laura', prospectCompany: 'Sala X', locale: 'es-ES',
  priceMode: 'per_module', totalPrice: null, currency: 'EUR', themeOverride: null, items: [],
};
const item = (over: Partial<RenderItem>): RenderItem => ({
  id: 'i1', position: 1, blockType: 'hero-pitch', moduleKey: 'k', defaultProps: { title: 'Hola' }, propOverrides: {},
  defaultPrice: 100, priceOverride: null, currency: 'EUR', ...over,
});

describe('resolveItem', () => {
  test('default ⊕ overrides + defaults del schema + precio', () => {
    const r = resolveItem(item({ propOverrides: { subtitle: 'Sub' }, priceOverride: 80 }), dossier, null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.props).toMatchObject({ title: 'Hola', subtitle: 'Sub', rotatingWords: [], ctas: [], rotateEveryMs: 2200 });
    expect(r.ctx.price?.amount).toBe(80);
    expect(r.ctx.itemId).toBe('i1');
  });

  test('block_type desconocido → se omite, no rompe el dossier', () => {
    const r = resolveItem(item({ blockType: 'nope' }), dossier, null);
    expect(r).toMatchObject({ ok: false });
  });

  test('props inválidas → se omite con motivo', () => {
    const r = resolveItem(item({ defaultProps: {}, propOverrides: { ctas: [{ label: 'x', href: 'javascript:alert(1)' }] } }), dossier, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/title|href/);
  });
});

describe('helpers', () => {
  test('deepMerge: objetos se fusionan, arrays se reemplazan', () => {
    expect(deepMerge({ a: { x: 1, y: 2 }, l: [1, 2] }, { a: { y: 3 }, l: [9] })).toEqual({ a: { x: 1, y: 3 }, l: [9] });
  });
  test('interpolate', () => {
    expect(interpolate('Para {company} ({prospect})', { prospectName: 'Laura', prospectCompany: 'Sala X' })).toBe('Para Sala X (Laura)');
    expect(interpolate('Para {company}', { prospectName: 'Laura', prospectCompany: null })).toBe('Para Laura');
  });
});
