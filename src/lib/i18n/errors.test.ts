import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { localizeError } from './errors';
import { withRequestLocale } from './request';
import { AdminError } from '../admin/service';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.(ts|astro)$/.test(f) && !/\.(test|contract)\.ts$/.test(f) ? [p] : [];
});

describe('errores del servidor en cuatro idiomas', () => {
  test('cada mensaje literal de AdminError está traducido', () => {
    const missing: string[] = [];
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8');
      // Todos los textos entre comillas de la línea del AdminError (también los de un `a ? 'x' : 'y'`).
      for (const line of src.split('\n').filter((l) => l.includes('new AdminError('))) {
        for (const m of line.slice(line.indexOf('new AdminError(')).matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
          const es = m[1].replace(/\\'/g, "'");
          if (es.includes(' ') && /[a-zá-ú]/.test(es) && localizeError(es, 'en') === es) missing.push(`${f}: ${es}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
  test('con datos dentro', () => {
    expect(localizeError('Como mucho 12 fotos', 'ko')).toBe('사진은 최대 12장입니다');
    expect(localizeError('El bloque «precio» no es válido', 'en')).toBe('The block «precio» is not valid');
  });
  test('sin traducción, tal cual; en español, tal cual', () => {
    expect(localizeError('Algo nuevo', 'en')).toBe('Algo nuevo');
    expect(localizeError('Sector no encontrado', 'es')).toBe('Sector no encontrado');
  });
  test('AdminError sale en el idioma de la petición', () => {
    expect(new AdminError(404, 'Sector no encontrado').message).toBe('Sector no encontrado');
    expect(withRequestLocale('en', () => new AdminError(404, 'Sector no encontrado').message)).toBe('Sector not found');
    expect(withRequestLocale('ko', () => new AdminError(404, 'Sector no encontrado').message)).toBe('업종을 찾을 수 없습니다');
  });
});

describe('puntos de partida de la configuración guiada', async () => {
  const { untranslatedPresetTexts, localizePreset, PRESETS } = await import('../setup/presets');
  test('todos los textos traducidos', () => expect(untranslatedPresetTexts()).toEqual([]));
  test('las claves no cambian', () => {
    const ko = localizePreset(PRESETS, 'ko');
    expect(ko.map((p) => p.key)).toEqual(PRESETS.map((p) => p.key));
    expect(ko[1].segments[0]).toMatchObject({ key: 'centros-buceo', name: '다이빙 센터' });
  });
});
