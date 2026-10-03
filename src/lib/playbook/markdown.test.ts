import { describe, expect, test } from 'vitest';
import { renderMarkdown, stripMarkdown } from './markdown';

describe('markdown seguro', () => {
  test('negrita, cursiva, listas y párrafos', () => {
    expect(renderMarkdown('Hola **mundo** y *tú*\n\n- uno\n- dos')).toBe('<p>Hola <strong>mundo</strong> y <em>tú</em></p><ul><li>uno</li><li>dos</li></ul>');
  });
  test('escapa HTML y no interpreta enlaces', () => {
    const h = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>');
    expect(h).not.toMatch(/<script|<img|href=/);
    expect(h).toContain('&lt;script&gt;');
  });
  test('texto plano', () => {
    expect(stripMarkdown('**a** *b*')).toBe('a b');
  });
});
