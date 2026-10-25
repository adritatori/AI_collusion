import { describe, expect, it } from 'vitest';
import { describeMissing, missingReport } from '../src/core/missing';

describe('missingReport', () => {
  it('counts dropped cells and regression rows', () => {
    // 5 rounds x 3 agents; agent 1 missing in round 2 (t=2).
    const p = Array.from({ length: 5 }, (_, t) => [0.3, t === 2 ? NaN : 0.4, 0.5]);
    const r = missingReport(p, null);
    expect(r.missingCells).toBe(1);
    expect(r.perAgent).toEqual([0, 1, 0]);
    // Influence of agent 1 on others needs p_1(t-1): drops t=3. For agent 1 as target: drops t=2 and t=3.
    expect(r.influenceRowsDropped[0][1]).toBe(1);
    expect(r.influenceRowsDropped[1][0]).toBe(2);
    expect(r.influenceRowsDropped[0][2]).toBe(0);
    expect(r.corrRowsDropped[0][1]).toBe(2);
    expect(r.influenceRowsMaxDropped).toBe(2);
    expect(describeMissing(r)).toMatch(/^1 of 15 prices are missing/);
  });
  it('counts a missing benchmark round', () => {
    const p = Array.from({ length: 4 }, () => [0.3, 0.4]);
    expect(missingReport(p, [0.3, NaN, 0.3, 0.3]).influenceRowsDropped[0][1]).toBe(1);
  });
  it('says so when nothing is missing', () => {
    expect(describeMissing(missingReport([[1, 2], [3, 4]], null))).toBe('No missing prices: every round was used.');
  });
});
