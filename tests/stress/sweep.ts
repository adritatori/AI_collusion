// Shared helpers: false-alarm and detection rates for a set of thresholds on simulated episodes.
import { allScores, evaluatePlusFactor, type Matrix, type Thresholds } from '../../src/core/detectors';
import type { Rng } from '../../src/core/rng';
import { episode, type CaseName, type Episode, type SimOptions } from '../../src/core/sim';

export interface Rates { influence: number; plus_factor: number; n: number }

/** Influence flag rate and plus-factor rate for one case under thresholds th. */
export function rates(
  c: CaseName, n: number, rng: Rng, th: Thresholds, opts: SimOptions = {},
  transform: (ep: Episode, rng: Rng) => Matrix = (ep) => ep.p,
  accept: (p: Matrix) => boolean = () => true,
): Rates {
  let infl = 0, pf = 0, used = 0;
  while (used < n) {
    const ep = episode(c, rng, opts);
    const p = transform(ep, rng);
    if (!accept(p)) continue;
    used++;
    const s = allScores(p, ep.b, ep.flags);
    infl += +(s.influence > th.influence);
    pf += +evaluatePlusFactor(s, th).plusFactor;
  }
  return { influence: infl / n, plus_factor: pf / n, n };
}
