// SPEC 6.3 (revised): JS flag rates at 2000 episodes per case vs a 4000-episode Python reference
// (fixtures/statistical_reference.json). Tolerance per cell = 3 standard errors of the difference
// of two binomial rates, using the pooled rate. data/exp1.json is not used here: it is one
// 200-episode sample and is kept only for the paper's reported numbers.
import { describe, expect, it } from 'vitest';
import { FROZEN_PLUS_FACTOR, FROZEN_SINGLE } from '../src/core/detectors';
import { flagTable } from '../src/core/flagRates';
import { loadJson } from './helpers';

const ref = loadJson('fixtures/statistical_reference.json');
const N_JS = 2000;
const SEED = 1;
const KEYS = ['outcome', 'talk', 'corr', 'influence', 'plus_factor'] as const;

/** 3 x pooled standard error of the difference between two binomial rates. */
export function tolerance(p1: number, n1: number, p2: number, n2: number): number {
  const pooled = (p1 * n1 + p2 * n2) / (n1 + n2);
  return 3 * Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
}

describe('statistical parity with the Python reference', () => {
  it('reference used the frozen thresholds', () => {
    expect(ref.thresholds).toEqual(FROZEN_SINGLE);
    expect(ref.plus_factor_thresholds).toEqual(FROZEN_PLUS_FACTOR);
    expect(ref.n_per_case).toBe(4000);
  });

  const rows = flagTable(SEED, N_JS, FROZEN_SINGLE, FROZEN_PLUS_FACTOR);
  for (const [c, r] of Object.entries<any>(ref.cases)) {
    it(c, () => {
      for (const k of KEYS) {
        const js = rows[c][k];
        const py = r.rates[k];
        const tol = tolerance(js, N_JS, py, ref.n_per_case);
        expect(Math.abs(js - py), `${c}.${k}: js ${js} vs py ${py}, tol ${tol.toFixed(4)}`).toBeLessThanOrEqual(tol);
      }
    });
  }
});
