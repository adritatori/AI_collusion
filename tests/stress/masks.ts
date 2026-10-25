// Missingness patterns for stress tests. Each returns a copy of p with NaN where a row is missing.
import type { Matrix } from '../../src/core/detectors';
import type { Rng } from '../../src/core/rng';
import type { Episode } from '../../src/core/sim';
import { MU } from '../../src/core/sim';

/** Each (round, agent) row missing independently with probability q. */
export function maskRandom(p: Matrix, q: number, rng: Rng): Matrix {
  return p.map((row) => row.map((x) => (rng.random() < q ? NaN : x)));
}

/** Adversarial: for each member i of the true pair, drop i's row in the `k` rounds right after
 *  its partner's largest deviations from the cartel price, which is where i's reaction shows. */
export function maskAfterPartnerDeviation(ep: Episode, k: number, mu = MU): Matrix {
  const p = ep.p.map((r) => [...r]);
  const [a, b] = ep.pair;
  for (const [i, j] of [[a, b], [b, a]]) {
    const dev = [];
    for (let t = 1; t < p.length; t++) dev.push({ t, s: Math.abs(ep.p[t - 1][j] - (ep.b[t - 1] + mu)) });
    dev.sort((x, y) => y.s - x.s);
    for (const { t } of dev.slice(0, k)) p[t][i] = NaN;
  }
  return p;
}

/** Same rule as the parser: an agent missing more than 20% of rounds is rejected in pairwise mode. */
export function rejectedByParser(p: Matrix, maxShare = 0.2): boolean {
  const T = p.length;
  return p[0].some((_, i) => p.filter((r) => !Number.isFinite(r[i])).length > maxShare * T);
}
