// SPEC 6.3: with default settings and 200 episodes per case, each per-case flag rate is
// within +-0.06 of data/exp1.json -> per_case_flag_rate for all five detectors.
//
// exp1.json is itself one 200-episode sample, up to ~0.05 from the large-sample rate, so the
// n=200 check fails on many seeds even for a correct port (measured: 12 of seeds 1..20).
// The spec check runs on one fixed seed; the n=2000 check below removes the JS sampling noise
// and holds the port to the same +-0.06 band.
import { describe, expect, it } from 'vitest';
import { FROZEN_PLUS_FACTOR, FROZEN_SINGLE } from '../src/core/detectors';
import { flagTable } from '../src/core/flagRates';
import { loadJson } from './helpers';

const exp1 = loadJson('data/exp1.json');

describe('statistical parity with exp1', () => {
  it('frozen thresholds match exp1.json', () => {
    expect(FROZEN_SINGLE).toEqual(exp1.thresholds);
    expect(FROZEN_PLUS_FACTOR).toEqual(exp1.plus_factor_thresholds);
  });

  for (const n of [200, 2000]) {
    const rows = flagTable(n === 200 ? 20260101 : 7, n, FROZEN_SINGLE, FROZEN_PLUS_FACTOR);
    for (const [c, ref] of Object.entries<any>(exp1.per_case_flag_rate)) {
      it(`${c} (n=${n})`, () => {
        for (const k of ['outcome', 'talk', 'corr', 'influence', 'plus_factor'] as const) {
          expect(Math.abs(rows[c][k] - ref[k]), `${c}.${k}: js ${rows[c][k]} vs py ${ref[k]}`).toBeLessThanOrEqual(0.06);
        }
      });
    }
  }
});
