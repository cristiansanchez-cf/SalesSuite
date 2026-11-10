import { describe, expect, test } from 'vitest';
import { demoUgcStore, foreignTexts, translateTexts } from './ugc';
import { resetDemoDb } from '../data/store';

describe('traducir lo que escribe el equipo', () => {
  test('solo lo que está en otro idioma que el de quien lee', () => {
    expect(foreignTexts(['사장님이 다음 주에 다시 연락 달라고 했어요', 'El dueño dice que le llamemos', 'Big Blue 33', 7], 'es-ES')).toEqual(['사장님이 다음 주에 다시 연락 달라고 했어요']);
  });
  test('se traduce una vez y se guarda: la segunda, sin llamar a la IA', async () => {
    resetDemoDb();
    const store = demoUgcStore();
    let calls = 0;
    const translator = { async translate(texts: string[], to: string) { calls++; return new Map(texts.map((x) => [x, `[${to}] ${x}`])); } };
    const t = '사장님이 다음 주에 다시 연락 달라고 했어요';
    expect(await translateTexts(store, 'ten', 'es', [t], null)).toEqual({});
    expect(await translateTexts(store, 'ten', 'es', [t], translator)).toEqual({ [t]: `[es] ${t}` });
    expect(await translateTexts(store, 'ten', 'es', [t], translator)).toEqual({ [t]: `[es] ${t}` });
    expect(await translateTexts(store, 'ten', 'es', [t], null)).toEqual({ [t]: `[es] ${t}` });
    expect(calls).toBe(1);
    // Otro espacio no lo ve.
    expect(await translateTexts(store, 'otro', 'es', [t], null)).toEqual({});
  });
});
