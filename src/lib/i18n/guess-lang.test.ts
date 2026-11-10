import { describe, expect, test } from 'vitest';
import { guessLang } from './guess-lang';

describe('de qué idioma es lo que escribe el equipo', () => {
  test('coreano, español, inglés y portugués', () => {
    expect(guessLang('사장님이 다음 주에 다시 연락 달라고 했어요')).toBe('ko');
    expect(guessLang('El dueño dice que le llamemos la semana que viene')).toBe('es');
    expect(guessLang('The owner wants us to call him next week')).toBe('en');
    expect(guessLang('O dono quer que liguemos na próxima semana, não hoje')).toBe('pt');
  });
  test('sin saberlo, no se ofrece traducir', () => {
    expect(guessLang('Big Blue 33')).toBeNull();
    expect(guessLang('+82 10')).toBeNull();
  });
});
