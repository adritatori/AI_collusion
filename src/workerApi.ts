// Pure request handler for the worker, so it can be tested without a Worker.
import { calibrate, usesFrozenThresholds, type Calibration, type MissingMask } from './core/calibrate';
import { allScores, evaluatePlusFactor, FROZEN_PLUS_FACTOR, FROZEN_SINGLE, type Scores, type Thresholds } from './core/detectors';
import { makeRng } from './core/rng';
import { episode, retainedMarkup, type CaseName, type Episode, type SimOptions } from './core/sim';

export type Request =
  | { type: 'calibrate'; T: number; N: number; seed: number; mask?: MissingMask | null }
  | { type: 'playground'; case: CaseName; sim: SimOptions; seed: number; n: number };

export interface PlaygroundResult {
  thresholdSet: 'frozen' | 'calibrated';
  thresholds: { single: Required<Thresholds>; plusFactor: Thresholds };
  calibration: Calibration | null;
  rates: { outcome: number; talk: number | null; corr: number; influence: number; plus_factor: number };
  /** Mean retained markup of the pair (cartel cases only). */
  retainedMarkup: number | null;
  n: number;
  example: { episode: Episode; scores: Scores; plusFactor: boolean };
}

export type Response =
  | { type: 'calibrate'; result: Calibration }
  | { type: 'playground'; result: PlaygroundResult };

export function handle(req: Request): Response {
  if (req.type === 'calibrate') {
    return { type: 'calibrate', result: calibrate(req.T, req.N, req.seed, undefined, req.mask ?? null) };
  }
  const { T = 30, N = 4 } = req.sim;
  const frozen = usesFrozenThresholds(T, N);
  const calibration = frozen ? null : calibrate(T, N, req.seed + 1);
  // Single-detector rows use the paper's balanced-accuracy thresholds when frozen; when
  // calibrated, influence and talk use the calibrated 95th percentiles for both.
  const pf: Thresholds = frozen ? FROZEN_PLUS_FACTOR : calibration!.thresholds;
  const single: Required<Thresholds> = frozen
    ? FROZEN_SINGLE
    : { ...FROZEN_SINGLE, influence: pf.influence, talk: pf.talk };
  const rng = makeRng(req.seed);
  const talkOn = req.sim.talk !== 'none';
  const count = { outcome: 0, talk: 0, corr: 0, influence: 0, plus_factor: 0 };
  let markup = 0;
  let example: PlaygroundResult['example'] | null = null;
  for (let k = 0; k < req.n; k++) {
    const ep = episode(req.case, rng, req.sim);
    const s = allScores(ep.p, ep.b, talkOn ? ep.flags : null);
    count.outcome += +(s.outcome > single.outcome);
    count.talk += +(s.talk !== null && s.talk > single.talk);
    count.corr += +(s.corr > single.corr);
    count.influence += +(s.influence > single.influence);
    const plus = evaluatePlusFactor(s, pf, { influenceReliable: T >= 20 }).plusFactor;
    count.plus_factor += +plus;
    markup += retainedMarkup(ep, req.sim.mu) / req.n;
    if (k === 0) example = { episode: ep, scores: s, plusFactor: plus };
  }
  const r = (x: number) => x / req.n;
  return {
    type: 'playground',
    result: {
      thresholdSet: frozen ? 'frozen' : 'calibrated',
      thresholds: { single, plusFactor: pf },
      calibration,
      rates: { outcome: r(count.outcome), talk: talkOn ? r(count.talk) : null, corr: r(count.corr), influence: r(count.influence), plus_factor: r(count.plus_factor) },
      retainedMarkup: req.case.startsWith('cartel') ? markup : null,
      n: req.n,
      example: example!,
    },
  };
}
