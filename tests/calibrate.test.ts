// SPEC 5.3: calibrated thresholds bring the false-alarm rate back near 5% at other lengths and sizes.
// Measured on fresh seeds, never the seed used to calibrate. Rates are printed for the PR description.
import { describe, expect, it } from 'vitest';
import { allScores, evaluatePlusFactor, FROZEN_PLUS_FACTOR } from '../src/core/detectors';
import { calibrate, quantile, thresholdsFor } from '../src/core/calibrate';
import { makeRng } from '../src/core/rng';
import { episode, type CaseName, type SimOptions } from '../src/core/sim';

function falseAlarms(c: CaseName, th: typeof FROZEN_PLUS_FACTOR, T: number, N: number, seed: number, n = 400, opts: SimOptions = {}) {
  const rng = makeRng(seed);
  let infl = 0;
  let pf = 0;
  for (let k = 0; k < n; k++) {
    const ep = episode(c, rng, { ...opts, N, T });
    const s = allScores(ep.p, ep.b, ep.flags);
    if (s.influence > th.influence) infl++;
    if (evaluatePlusFactor(s, th).plusFactor) pf++;
  }
  return { infl: infl / n, pf: pf / n };
}

describe('quantile', () => {
  it('matches numpy linear interpolation', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([0, 10], 0.95)).toBeCloseTo(9.5, 12);
    expect(quantile([5], 0.95)).toBe(5);
  });
});

describe('calibration (SPEC 5.3)', () => {
  it('T=20, N=4: competitive influence false alarms return to 0.05 +- 0.03, boom plus-factor below 0.39', () => {
    const cal = calibrate(20, 4, 11);
    const comp = falseAlarms('competitive', cal.thresholds, 20, 4, 9001);
    const boom = falseAlarms('boom_parallel', cal.thresholds, 20, 4, 9002);
    const uncal = falseAlarms('boom_parallel', FROZEN_PLUS_FACTOR, 20, 4, 9002);
    console.log('T=20 N=4 calibrated', cal.thresholds, 'competitive influence FA', comp.infl, 'boom pf FA', boom.pf, 'uncalibrated boom pf FA', uncal.pf);
    expect(Math.abs(comp.infl - 0.05)).toBeLessThanOrEqual(0.03);
    expect(boom.pf).toBeLessThan(0.39);
  });

  it('frozen thresholds are used as-is at T=30, N=4', () => {
    const c = thresholdsFor(30, 4, 1);
    expect(c.frozen).toBe(true);
    expect(c.thresholds).toEqual(FROZEN_PLUS_FACTOR);
  });

  it('is deterministic for a given seed', () => {
    expect(calibrate(15, 3, 5, 60).thresholds).toEqual(calibrate(15, 3, 5, 60).thresholds);
  });

  // Messy grid: very short, very long, tiny and large markets. Only the cap on false alarms is asserted;
  // the measured rates are logged.
  const grid: [number, number][] = [[10, 4], [15, 4], [20, 2], [20, 8], [30, 2], [30, 8], [60, 4], [120, 4]];
  for (const [T, N] of grid) {
    it(`T=${T}, N=${N}: innocent false alarms stay low`, () => {
      const cal = calibrate(T, N, 21);
      const comp = falseAlarms('competitive', cal.thresholds, T, N, 7001, 300);
      const boom = falseAlarms('boom_parallel', cal.thresholds, T, N, 7002, 300);
      console.log(`T=${T} N=${N}: competitive influence FA ${comp.infl.toFixed(3)}, boom plus-factor FA ${boom.pf.toFixed(3)}`);
      expect(comp.infl).toBeLessThanOrEqual(0.12);
      expect(boom.pf).toBeLessThanOrEqual(0.25);
    });
  }

  it('adversarial: innocent markets with unusual benchmark shifts are not flagged by the plus-factor rule', () => {
    const cal = calibrate(30, 4, 31); // calibrated on shift 0.3 boom; test on shifted benchmarks
    for (const shift of [0.1, 0.4]) {
      const r = falseAlarms('competitive', cal.thresholds, 30, 4, 5000 + shift * 100, 300, { benchShift: shift });
      console.log(`shift ${shift}: plus-factor FA ${r.pf.toFixed(3)}`);
      expect(r.pf).toBeLessThanOrEqual(0.15);
    }
  });
});
