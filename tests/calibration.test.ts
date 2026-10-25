// SPEC 5.3 calibration test. Single 300-episode runs are noisy (one SD of the false-alarm rate
// is about 0.015), so the rule is checked on the mean of 10 independent calibrate -> fresh-seed
// pairs. The spread of single runs is in reports/calibration.md (npm run stress).
import { describe, expect, it } from 'vitest';
import { calibrate, maskOf, quantile, usesFrozenThresholds } from '../src/core/calibrate';
import { FROZEN_PLUS_FACTOR } from '../src/core/detectors';
import { makeRng } from '../src/core/rng';
import { rates } from './stress/sweep';

describe('quantile', () => {
  it('matches numpy.quantile (linear)', () => {
    expect(quantile([1, 2, 3, 4], 0.95)).toBeCloseTo(3.85, 12);
    expect(quantile([5, 1, 4, 2, 3], 0.5)).toBe(3);
    expect(quantile([0.1, 0.7, 0.3], 0.95)).toBeCloseTo(0.66, 12);
    expect(quantile(Array.from({ length: 600 }, (_, k) => k / 7), 0.95)).toBeCloseTo(81.29285714285714, 10);
  });
});

describe('calibrate', () => {
  it('is deterministic for a seed and keeps the frozen outcome threshold', () => {
    const a = calibrate(20, 4, 3);
    expect(calibrate(20, 4, 3)).toEqual(a);
    expect(a.thresholds.outcome).toBe(FROZEN_PLUS_FACTOR.outcome);
    expect(a.episodes).toBe(600);
    expect(a.maskApplied).toBe(false);
  });

  it('uses frozen thresholds only at T=30, N=4', () => {
    expect(usesFrozenThresholds(30, 4)).toBe(true);
    expect(usesFrozenThresholds(20, 4)).toBe(false);
    expect(usesFrozenThresholds(30, 5)).toBe(false);
  });

  it('applies a missing-row mask and checks its shape', () => {
    const p = Array.from({ length: 20 }, (_, t) => [0.3, t === 3 ? NaN : 0.3, 0.3, 0.3]);
    expect(calibrate(20, 4, 1, 50, maskOf(p)).maskApplied).toBe(true);
    expect(calibrate(20, 4, 1, 50, maskOf(p.map((r) => r.map(() => 0.3)))).maskApplied).toBe(false);
    expect(() => calibrate(25, 4, 1, 50, maskOf(p))).toThrow(/shape/);
  });

  it('SPEC 5.3: at T=20, N=4 calibrated thresholds restore a 5% influence false-alarm rate', () => {
    const R = 10;
    let compFA = 0, boomPF = 0, boomPFfrozen = 0;
    for (let r = 0; r < R; r++) {
      const th = calibrate(20, 4, 100 + r).thresholds;
      compFA += rates('competitive', 300, makeRng(900 + r), th, { T: 20 }).influence / R;
      boomPF += rates('boom_parallel', 300, makeRng(950 + r), th, { T: 20 }).plus_factor / R;
      boomPFfrozen += rates('boom_parallel', 300, makeRng(950 + r), FROZEN_PLUS_FACTOR, { T: 20 }).plus_factor / R;
    }
    expect(Math.abs(compFA - 0.05)).toBeLessThanOrEqual(0.03);
    expect(boomPF).toBeLessThan(0.39);
    expect(boomPF).toBeLessThan(boomPFfrozen);
  });
});
