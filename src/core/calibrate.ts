// Length- and size-matched thresholds (SPEC 5.3): the 95th percentile of influence and talk
// over 300 competitive + 300 boom_parallel episodes simulated with the log's own T and N.
// Outcome keeps the frozen threshold because uploaded logs use the user's competitive price.
// If the log has missing prices, its missing-row pattern is applied to every simulated episode,
// because dropped rows inflate influence the same way a shorter log does.
import { FROZEN_PLUS_FACTOR, influenceScore, talkScore, type Matrix, type Thresholds } from './detectors';
import { makeRng } from './rng';
import { episode } from './sim';

export const CALIBRATION_EPISODES = 300;
export const CALIBRATION_QUANTILE = 0.95;

/** numpy.quantile with the default linear interpolation. */
export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

export interface Calibration {
  thresholds: Thresholds;
  T: number;
  N: number;
  seed: number;
  episodes: number;
  /** True if the log's missing-row pattern was applied to the simulated episodes. */
  maskApplied: boolean;
}

/** mask[t][i] = true where the uploaded log has no price. */
export type MissingMask = boolean[][];

export function maskOf(p: Matrix): MissingMask {
  return p.map((row) => row.map((x) => !Number.isFinite(x)));
}

function applyMask(p: Matrix, mask: MissingMask): Matrix {
  return p.map((row, t) => row.map((x, i) => (mask[t][i] ? NaN : x)));
}

export function calibrate(
  T: number,
  N: number,
  seed: number,
  nPerCase = CALIBRATION_EPISODES,
  mask: MissingMask | null = null,
): Calibration {
  const useMask = mask !== null && mask.some((r) => r.some(Boolean));
  if (useMask && (mask!.length !== T || mask![0].length !== N)) throw new Error('mask shape must be T x N');
  const rng = makeRng(seed);
  const infl: number[] = [];
  const talk: number[] = [];
  for (const c of ['competitive', 'boom_parallel'] as const) {
    for (let k = 0; k < nPerCase; k++) {
      const ep = episode(c, rng, { T, N });
      infl.push(influenceScore(useMask ? applyMask(ep.p, mask!) : ep.p, ep.b).score);
      talk.push(talkScore(useMask ? applyMask(ep.flags, mask!) : ep.flags));
    }
  }
  return {
    thresholds: {
      outcome: FROZEN_PLUS_FACTOR.outcome,
      influence: quantile(infl, CALIBRATION_QUANTILE),
      talk: quantile(talk, CALIBRATION_QUANTILE),
    },
    T,
    N,
    seed,
    episodes: 2 * nPerCase,
    maskApplied: useMask,
  };
}

/** Frozen thresholds apply only to logs shaped like the ones they were set on. */
export const usesFrozenThresholds = (T: number, N: number) => T === 30 && N === 4;
