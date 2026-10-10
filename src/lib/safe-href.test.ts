import { describe, expect, test } from 'vitest';
import { safeHref } from './safe-href';

describe('enlaces de datos', () => {
  test('solo web, teléfono, email o rutas propias', () => {
    for (const ok of ['https://club.es', 'http://club.es/x', 'mailto:a@b.es', 'tel:+34600', '/admin/accounts/1']) expect(safeHref(ok)).toBe(ok);
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', '//evil.com', 'vbscript:x', '', null]) expect(safeHref(bad)).toBeUndefined();
  });
});
