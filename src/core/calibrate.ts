// Length- and size-matched thresholds (SPEC 5.3): 95th percentile of Influence and Talk over
// simulated innocent markets (competitive + boom_parallel) with the same T and N.
import { allScores, FROZEN_PLUS_FACTOR, type Thresholds } from './detectors';
import { makeRng } from './rng';
import { episode, type SimOptions } from './sim';

export interface Calibration {
  thresholds: Thresholds;
  T: number;
  N: number;
  /** Total simulated innocent markets used. */
  episodes: number;
  /** True when T=30, N=4 and the paper's frozen thresholds were used instead. */
  frozen: boolean;
}

/** np.quantile (linear interpolation). */
export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function calibrate(T: number, N: number, seed: number, perCase = 300, opts: SimOptions = {}): Calibration {
  const rng = makeRng(seed);
  const infl: number[] = [];
  const talk: number[] = [];
  for (const c of ['competitive', 'boom_parallel'] as const) {
    for (let k = 0; k < perCase; k++) {
      const ep = episode(c, rng, { ...opts, N, T });
      const s = allScores(ep.p, ep.b, ep.flags);
      infl.push(s.influence);
      talk.push(s.talk as number);
    }
  }
  return {
    thresholds: { outcome: FROZEN_PLUS_FACTOR.outcome, influence: quantile(infl, 0.95), talk: quantile(talk, 0.95) },
    T,
    N,
    episodes: perCase * 2,
    frozen: false,
  };
}

export function thresholdsFor(T: number, N: number, seed: number): Calibration {
  if (T === 30 && N === 4) return { thresholds: FROZEN_PLUS_FACTOR, T, N, episodes: 600, frozen: true };
  return calibrate(T, N, seed);
}
