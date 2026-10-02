import { describe, expect, test } from 'vitest';
import { STEP, needsRebalance, rankBetween, rankForMove, rebalance } from './rank';

describe('rank fraccional', () => {
  test('entre vecinos / extremos', () => {
    expect(rankBetween(null, null)).toBe(STEP);
    expect(rankBetween(1024, 2048)).toBe(1536);
    expect(rankBetween(null, 1024)).toBe(0);
    expect(rankBetween(2048, null)).toBe(2048 + STEP);
    expect(() => rankBetween(2, 1)).toThrow();
  });

  test('mover el #3 arriba del todo', () => {
    const pos = [1024, 2048, 3072, 4096];
    const p = rankForMove(pos, 2, 0);
    const next = [...pos.slice(0, 2), p, pos[3]].sort((a, b) => a - b);
    expect(next[0]).toBe(p);
  });

  test('mover al final y al medio', () => {
    const pos = [1024, 2048, 3072];
    expect(rankForMove(pos, 0, 2)).toBeGreaterThan(3072);
    const mid = rankForMove(pos, 2, 1);
    expect(mid).toBeGreaterThan(1024);
    expect(mid).toBeLessThan(2048);
  });

  test('detecta huecos agotados y rebalancea', () => {
    let a = 1, b = 2;
    for (let i = 0; i < 40; i++) b = rankBetween(a, b);
    expect(needsRebalance([a, b])).toBe(true);
    expect(rebalance(3)).toEqual([1024, 2048, 3072]);
  });
});
