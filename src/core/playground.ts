// Playground run: simulate episodes under the chosen settings and report per-detector flag rates.
import { allScores, evaluatePlusFactor, FROZEN_SINGLE, type Matrix, type Thresholds } from './detectors';
import { thresholdsFor } from './calibrate';
import { makeRng } from './rng';
import { episode, retainedMarkup, type CaseName, type Episode, type SimOptions } from './sim';

export interface PlaygroundParams {
  preset: CaseName;
  mu: number;
  gamma: number;
  eps: number;
  jitter: number;
  boomShift: number;
  T: number;
  N: number;
  talk: 'none' | 'collusive' | 'benign';
  seed: number;
  episodes: number;
}

export interface PlaygroundResult {
  params: PlaygroundParams;
  rates: { outcome: number; talk: number | null; corr: number; influence: number; plus_factor: number };
  markupKept: number;
  pairFound: number;
  thresholds: { single: Required<Thresholds>; plusFactor: Thresholds; frozen: boolean; calibrationEpisodes: number };
  example: { p: Matrix; b: number[]; pair: [number, number]; predPair: [number, number]; markupKept: number };
}

/** Presets that are innocent by construction ignore the cartel sliders (mu, gamma, eps, jitter). */
export function simOptions(p: PlaygroundParams): { c: CaseName; opts: SimOptions } {
  const boom = p.preset === 'boom_parallel';
  // boom_parallel is competitive pricing with a shifted benchmark; the shift slider applies to every preset.
  return {
    c: boom ? 'competitive' : p.preset,
    opts: { N: p.N, T: p.T, mu: p.mu, gamma: p.gamma, eps: p.eps, jitter: p.jitter, benchShift: p.boomShift, talk: p.talk },
  };
}

export function runPlayground(p: PlaygroundParams): PlaygroundResult {
  const cal = thresholdsFor(p.T, p.N, p.seed + 1);
  const single: Required<Thresholds> = cal.frozen
    ? FROZEN_SINGLE
    : { ...FROZEN_SINGLE, influence: cal.thresholds.influence, talk: cal.thresholds.talk };
  const rng = makeRng(p.seed);
  const { c, opts } = simOptions(p);
  const hasTalk = p.talk !== 'none';
  const counts = { outcome: 0, talk: 0, corr: 0, influence: 0, plus_factor: 0 };
  let markup = 0;
  let pairHit = 0;
  let example: Episode | null = null;
  let examplePred: [number, number] = [0, 1];
  for (let k = 0; k < p.episodes; k++) {
    const ep = episode(c, rng, opts);
    const s = allScores(ep.p, ep.b, hasTalk ? ep.flags : null);
    if (s.outcome > single.outcome) counts.outcome++;
    if (s.talk !== null && s.talk > single.talk) counts.talk++;
    if (s.corr > single.corr) counts.corr++;
    if (s.influence > single.influence) counts.influence++;
    if (evaluatePlusFactor(s, cal.thresholds).plusFactor) counts.plus_factor++;
    markup += retainedMarkup(ep, p.mu);
    if (s.predPair[0] === ep.pair[0] && s.predPair[1] === ep.pair[1]) pairHit++;
    if (k === 0) { example = ep; examplePred = s.predPair; }
  }
  const n = p.episodes;
  const ex = example as Episode;
  return {
    params: p,
    rates: {
      outcome: counts.outcome / n,
      talk: hasTalk ? counts.talk / n : null,
      corr: counts.corr / n,
      influence: counts.influence / n,
      plus_factor: counts.plus_factor / n,
    },
    markupKept: markup / n,
    pairFound: pairHit / n,
    thresholds: { single, plusFactor: cal.thresholds, frozen: cal.frozen, calibrationEpisodes: cal.episodes },
    example: { p: ex.p, b: ex.b, pair: ex.pair, predPair: examplePred, markupKept: retainedMarkup(ex, p.mu) },
  };
}
