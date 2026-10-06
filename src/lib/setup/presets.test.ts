import { describe, expect, test } from 'vitest';
import { localizePreset, PERSONALITY, PRESETS } from './presets';

const LOCS = ['en', 'pt', 'ko'] as const;
/** Lo que el diccionario dice de unos textos conocidos (presets.ts → TEXT). */
const KNOWN: Record<string, Record<(typeof LOCS)[number], string>> = {
  'Buceadores': { en: 'Divers', pt: 'Mergulhadores', ko: '다이버' },
  'Tipo de experiencia': { en: 'Type of experience', pt: 'Tipo de experiência', ko: '경험 유형' },
  '¿En qué región está la cuenta?': { en: 'Which region is the account in?', pt: 'Em que região está a conta?', ko: '계정은 어느 지역에 있나요?' },
  'Brasil': { en: 'Brazil', pt: 'Brasil', ko: '브라질' },
};

/** Todos los textos (con su campo) de un objeto, en orden. */
function strings(v: unknown, field = ''): Array<[string, string]> {
  if (typeof v === 'string') return [[field, v]];
  if (Array.isArray(v)) return v.flatMap((x) => strings(x, field));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, k));
  return [];
}

describe('localizePreset: el punto de partida en cada idioma', () => {
  test('en español devuelve lo mismo (el mismo objeto)', () => {
    expect(localizePreset(PRESETS, 'es')).toBe(PRESETS);
  });

  for (const l of LOCS) {
    test(`${l}: traduce los textos conocidos en los campos visibles`, () => {
      const x = { name: 'Buceadores', label: 'Tipo de experiencia', question: '¿En qué región está la cuenta?', options: [{ label: 'Brasil' }] };
      expect(localizePreset(x, l)).toEqual({ name: KNOWN.Buceadores[l], label: KNOWN['Tipo de experiencia'][l], question: KNOWN['¿En qué región está la cuenta?'][l], options: [{ label: KNOWN.Brasil[l] }] });
    });
    test(`${l}: lo que no está en el diccionario se queda en español`, () => {
      const x = { name: 'Texto nuevo sin traducir', description: 'Otra cosa', hint: 'Pista nueva' };
      expect(localizePreset(x, l)).toEqual(x);
    });
    test(`${l}: claves, iconos, roles y números no cambian aunque coincidan con un texto traducible`, () => {
      const x = { key: 'Buceadores', icon: 'Brasil', role: 'Buceadores', scope: 'account', weight: 2, multi: true, extra: null };
      expect(localizePreset(x, l)).toEqual(x);
    });
    test(`${l}: los puntos de partida conservan forma, claves e iconos y no queda nada sin traducir`, () => {
      const out = localizePreset(PRESETS, l);
      const a = strings(PRESETS);
      const b = strings(out);
      expect(b.map(([f]) => f)).toEqual(a.map(([f]) => f));
      a.forEach(([f, s], i) => {
        if (['key', 'icon', 'role', 'scope'].includes(f)) expect(b[i][1]).toBe(s);
      });
      expect(out.map((p) => p.segments.map((s) => s.key))).toEqual(PRESETS.map((p) => p.segments.map((s) => s.key)));
      // Al menos los nombres de los puntos de partida cambian (salvo que sean iguales en ese idioma).
      expect(out.some((p, i) => p.name !== PRESETS[i].name)).toBe(true);
    });
    test(`${l}: no modifica el original`, () => {
      const before = JSON.stringify(PRESETS);
      localizePreset(PRESETS, l);
      localizePreset(PERSONALITY, l);
      expect(JSON.stringify(PRESETS)).toBe(before);
    });
  }

  test('coreano: el tipo de personalidad también se traduce (si está en el diccionario)', () => {
    const ko = localizePreset(PERSONALITY, 'ko');
    expect(ko.key).toBe(PERSONALITY.key);
    expect(ko.options.map((o) => o.icon)).toEqual(PERSONALITY.options.map((o) => o.icon));
  });
  test('valores que no son objetos pasan tal cual', () => {
    expect(localizePreset('Buceadores', 'en')).toBe('Buceadores');  // sin campo: no se traduce
    expect(localizePreset(null, 'pt')).toBeNull();
    expect(localizePreset(3, 'ko')).toBe(3);
    expect(localizePreset(['Buceadores'], 'en')).toEqual(['Buceadores']);
  });
});
