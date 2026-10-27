// Evidence profile for an uploaded log (SPEC 4.7, 5.3, 5.4). Never returns a verdict or a probability.
import {
  allScores, collusionIndex, corrScore, evaluatePlusFactor, FROZEN_PLUS_FACTOR, outcomeScore, talkScore,
  type Matrix, type PlusFactorParts, type Profile, type Thresholds,
} from './detectors';
import { MIN_RELIABLE_T, type Mode, type ParsedLog } from './parse';
import { restOfMarketInfluence } from './realInfluence';
import { MU } from './sim';

export interface AuditSettings {
  mode: Mode;
  /** The price a fully competitive market would settle at. */
  competitive: number;
  /** The price a fully coordinated market would settle at (optional when prices are in 0..1). */
  monopoly: number | null;
}

export interface Scores {
  T: number;
  N: number;
  mode: Mode;
  hasBenchmark: boolean;
  /** mean(price) - competitive, in the log's own units. */
  outcomeRaw: number;
  /** What is compared with the harm threshold: share of the competitive-to-monopoly gap, or raw units if no monopoly price. */
  harm: number;
  harmThreshold: number;
  harmUnit: 'share' | 'raw';
  /** Mean of the last 10 rounds, as a share of the competitive-to-monopoly gap. */
  collusionIndex: number | null;
  talk: number | null;
  corr: number;
  influence: number;
  influenceReliable: boolean;
  /** False when the influence statistic has no calibrated threshold (auction mode). */
  influenceCalibrated: boolean;
  accused: [number, number] | null;
  influenceMatrix: Matrix | null;
  perSeller: (number | null)[] | null;
  problems: string[];
}

/** Harm threshold in "share of the gap" units: the paper's 0.0857 raw threshold over the simulated full markup (MU). */
export const HARM_SHARE_THRESHOLD = FROZEN_PLUS_FACTOR.outcome / MU;

/** Competitive price to prefill: the mean of the log's own benchmark column, or null if there is none. */
export function defaultCompetitive(log: ParsedLog): number | null {
  if (!log.benchmark) return null;
  const v = log.benchmark.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function scoreLog(log: ParsedLog, s: AuditSettings): Scores {
  const T = log.p.length;
  const N = log.agents.length;
  const problems: string[] = [];
  const gap = s.monopoly === null ? null : s.monopoly - s.competitive;
  if (gap !== null && !(gap > 0)) problems.push('The monopoly price must be higher than the competitive price.');
  if (s.monopoly === null && log.outsideUnit) {
    problems.push('Prices are not between 0 and 1, so enter a monopoly price (the highest price a fully coordinated market would reach). Without it, "high" has no scale.');
  }
  const outcomeRaw = outcomeScore(log.p, s.competitive);
  const useShare = gap !== null && gap > 0;
  const idx = useShare ? collusionIndex(log.p, s.competitive, s.monopoly as number) : null;

  let influence: number;
  let accused: [number, number] | null = null;
  let matrix: Matrix | null = null;
  let perSeller: (number | null)[] | null = null;
  const hasBenchmark = log.benchmark !== null;
  if (s.mode === 'pairwise') {
    const sc = allScores(log.p, log.benchmark, null, s.competitive);
    influence = sc.influence;
    accused = sc.predPair;
    matrix = sc.influenceMatrix;
  } else {
    const r = restOfMarketInfluence(log.p, log.bids);
    influence = r.score;
    perSeller = r.perSeller;
  }
  const flagged = log.flags && log.flags.flat().some(Number.isFinite);
  return {
    T, N, mode: s.mode, hasBenchmark, outcomeRaw,
    harm: useShare ? outcomeRaw / (gap as number) : outcomeRaw,
    harmThreshold: useShare ? HARM_SHARE_THRESHOLD : FROZEN_PLUS_FACTOR.outcome,
    harmUnit: useShare ? 'share' : 'raw',
    collusionIndex: idx,
    talk: flagged ? talkScore(log.flags as Matrix) : null,
    corr: corrScore(log.p),
    influence,
    influenceReliable: T >= MIN_RELIABLE_T,
    influenceCalibrated: s.mode === 'pairwise',
    accused, influenceMatrix: matrix, perSeller, problems,
  };
}

export interface Judgement extends PlusFactorParts {
  /** Null while the scale for "high price" is missing (see Scores.problems). */
  usable: boolean;
  influenceInRule: boolean;
}

/** Apply the plus-factor rule with thresholds calibrated for this log's length and size. */
export function judge(sc: Scores, th: Thresholds): Judgement {
  const influenceInRule = sc.influenceReliable && sc.influenceCalibrated;
  const parts = evaluatePlusFactor(
    { outcome: sc.harm, talk: sc.talk, influence: sc.influence },
    { outcome: sc.harmThreshold, influence: th.influence, talk: th.talk },
    { influenceReliable: influenceInRule },
  );
  return { ...parts, usable: sc.problems.length === 0, influenceInRule };
}

export type { Profile };
