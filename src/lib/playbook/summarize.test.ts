import { describe, expect, test } from 'vitest';
import { stripMarkdown, summarize } from './markdown';

describe('stripMarkdown: texto plano para copiar el guion', () => {
  test('quita negritas y cursivas, deja el resto del texto igual', () => {
    expect(stripMarkdown('Di **siempre** el *nombre* del local')).toBe('Di siempre el nombre del local');
    expect(stripMarkdown('**Uno** y **dos**')).toBe('Uno y dos');
    expect(stripMarkdown('*a*')).toBe('a');
  });
  test('vacío y texto sin marcas', () => {
    expect(stripMarkdown('')).toBe('');
    expect(stripMarkdown('Hola, ¿qué tal?')).toBe('Hola, ¿qué tal?');
  });
  test('conserva saltos de línea y viñetas (no es summarize)', () => {
    expect(stripMarkdown('- uno\n- **dos**')).toBe('- uno\n- dos');
    expect(stripMarkdown('# Título\n\nTexto')).toBe('# Título\n\nTexto');
  });
  test('un asterisco suelto o una multiplicación no son cursiva', () => {
    expect(stripMarkdown('2 * 3 * 4')).toBe('2 * 3 * 4');
    expect(stripMarkdown('* uno\n* dos')).toBe('* uno\n* dos');
    expect(stripMarkdown('precio*')).toBe('precio*');
  });
  test('acentos, eñes y emojis intactos', () => {
    expect(stripMarkdown('**Año** de *ñandú* 🎉 «¡olé!»')).toBe('Año de ñandú 🎉 «¡olé!»');
  });
  test('no toca los enlaces (eso lo hace summarize)', () => {
    expect(stripMarkdown('[web](https://x.test)')).toBe('[web](https://x.test)');
  });
});

describe('summarize: más casos', () => {
  test('texto corto: igual, en una línea y sin espacios de sobra', () => {
    expect(summarize('Hola')).toBe('Hola');
    expect(summarize('  Hola   mundo  \n\n  otra   línea ')).toBe('Hola mundo otra línea');
    expect(summarize('Línea uno\r\nLínea dos')).toBe('Línea uno Línea dos');
  });
  test('vacío o solo marcas → cadena vacía', () => {
    expect(summarize('')).toBe('');
    expect(summarize('   \n\n  ')).toBe('');
    expect(summarize('- \n> \n#')).not.toMatch(/[-*>]/);
  });
  test('enlaces: se queda el texto, no la URL', () => {
    expect(summarize('Mira [el caso de Bresh](https://enjoy.test/casos/bresh) antes de llamar.')).toBe('Mira el caso de Bresh antes de llamar.');
    expect(summarize('[**Fuerte**](https://x.test) y [dos](/rel)')).toBe('Fuerte y dos');
  });
  test('títulos, citas y listas (viñetas, numeradas con punto o paréntesis)', () => {
    expect(summarize('# Primera llamada\n## Objetivo\nQue te cuente su noche.')).toBe('Primera llamada Objetivo Que te cuente su noche.');
    expect(summarize('- uno\n* dos\n• tres')).toBe('uno dos tres');
    expect(summarize('1) Saluda.\n2) Pregunta.\n10. Cierra.')).toBe('Saluda. Pregunta. Cierra.');
    expect(summarize('> > cita anidada')).toBe('cita anidada');
    expect(summarize('  - sangrada')).toBe('sangrada');
  });
  test('un hashtag sin espacio no es un título', () => {
    expect(summarize('#EnjoyNight es la etiqueta')).toBe('#EnjoyNight es la etiqueta');
  });
  test('negrita y cursiva dentro de listas', () => {
    expect(summarize('- **Escucha** primero\n- *Luego* propone')).toBe('Escucha primero Luego propone');
  });
  test('acentos y emojis se conservan', () => {
    expect(summarize('¿Qué pasó el **sábado**? 🎉 ¡Ñoño!')).toBe('¿Qué pasó el sábado? 🎉 ¡Ñoño!');
  });
  test('largo sin final de frase: corta en una palabra entera y añade «…»', () => {
    const src = Array.from({ length: 80 }, (_, i) => `palabra${i}`).join(' ');
    const s = summarize(src, 100);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(101);
    // Todas las palabras están enteras (ninguna a medias).
    for (const w of s.slice(0, -1).split(' ')) expect(src.split(' ')).toContain(w);
  });
  test('no deja una coma, un punto y coma o un guion colgando antes de «…»', () => {
    const s = summarize(`${'texto '.repeat(10)}uno, dos, tres; cuatro — cinco ${'más '.repeat(40)}`, 75);
    expect(s).toMatch(/[^\s,;:—–-]…$/);
  });
  test('prefiere un final de frase si está por encima del 45 % del máximo', () => {
    const a = 'Esta frase ocupa bastante sitio, más de la mitad del máximo. ';
    expect(summarize(a + 'Y esta otra ya no cabe entera porque es muy larga de verdad.', 80)).toBe(a.trim());
  });
  test('un final de frase demasiado pronto (< 45 %) no se usa: corta por palabra', () => {
    const s = summarize('Corto. Y luego sigue una frase muy larga que no termina nunca jamás de los jamases y sigue', 60);
    expect(s.endsWith('…')).toBe(true);
    expect(s.startsWith('Corto. Y luego')).toBe(true);
  });
  test('también corta tras «!», «?» y el cierre de una cita «»»', () => {
    expect(summarize('¿Cuántas noches abres a la semana? Y luego pregunta más cosas sin parar nunca', 50)).toBe('¿Cuántas noches abres a la semana?');
    expect(summarize('¡Dile que sí ya mismo, no esperes! Y luego más y más texto de relleno sin fin', 50)).toBe('¡Dile que sí ya mismo, no esperes!');
    expect(summarize('Dile: «¿Lo probamos el viernes en tu sala?» y espera su respuesta sin decir nada más', 60)).toBe('Dile: «¿Lo probamos el viernes en tu sala?»');
  });
  test('justo en el máximo no se corta', () => {
    const s = 'a'.repeat(220);
    expect(summarize(s)).toBe(s);
    expect(summarize('Hola mundo', 10)).toBe('Hola mundo');
  });
  test('una sola palabra larguísima: corta y pone «…» sin pasarse', () => {
    const s = summarize('x'.repeat(300), 50);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(51);
  });
  test('una frase que acaba exactamente en el máximo se queda entera', () => {
    expect(summarize('Uno dos tres. Cuatro cinco seis.', 13)).toBe('Uno dos tres.');
  });
  test('no parte un emoji por la mitad', () => {
    expect(summarize('😀'.repeat(40), 10).isWellFormed()).toBe(true);
  });
  test('una imagen en Markdown no deja el «!»', () => {
    expect(summarize('![logo](https://x.test/l.png) Hola')).toBe('logo Hola');
  });
  test('el código en línea conserva las comillas invertidas (el Markdown de jugadas no lo interpreta)', () => {
    expect(summarize('Escribe `hola` en la pantalla')).toBe('Escribe `hola` en la pantalla');
  });
});
