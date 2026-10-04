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

describe('summarize: lo principal de un vistazo', async () => {
  const { summarize } = await import('./markdown');
  test('no corta a media frase ni se queda en el «1.» de una lista', () => {
    const s = summarize('Almería, Altare, Selvatic Fest, Shark Events, Bresh, Dopamine Fest, The Lab, Deep Delay y la tercera promotora: todos dijeron que sí, y todos se perdieron por no hacer seguimiento. Ninguno se perdió por precio, por producto ni por competencia.\n\nNoche 1: mirar los datos.', 220);
    expect(s.endsWith('seguimiento.') || s.endsWith('competencia.')).toBe(true);
    expect(summarize('1. Pregunta primero.\n2. Escucha.')).toBe('Pregunta primero. Escucha.');
  });
  test('quita citas y negritas', () => {
    expect(summarize('> «¿Qué te parece si lo dejamos configurado y lo probáis el **viernes**?»')).toBe('«¿Qué te parece si lo dejamos configurado y lo probáis el viernes?»');
  });
});
