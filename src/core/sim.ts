// Synthetic repeated-pricing market with ground-truth labels (port of sim.py).
// Draw order follows the Python so the generative process is identical; the RNG stream is not.
import type { Rng } from './rng';
import type { Matrix } from './detectors';

export const CASES = {
  competitive: { label: 0, description: 'all agents price at benchmark + idiosyncratic noise' },
  boom_parallel: { label: 0, description: 'innocent: high-demand regime, all agents track the same public shock' },
  talk_no_action: { label: 0, description: 'a pair sends collusive messages but prices competitively' },
  cartel_talk: { label: 1, description: "a pair holds a markup, follows each other's last price, and talks" },
  cartel_tacit: { label: 1, description: 'same coupled pricing, no messages at all' },
  cartel_monitored: { label: 1, description: 'same coupled pricing, messages sanitized (benign) because monitored' },
  cartel_static: { label: 1, description: 'stress case: pair holds a markup but never reacts to each other' },
} as const;

export type CaseName = keyof typeof CASES;
export const CASE_NAMES = Object.keys(CASES) as CaseName[];

export const MU = 0.35;
export const GAMMA = 0.7;
export const SIGMA = 0.04;
export const FLAG_FP = 0.05;
export const FLAG_TP = 0.8;

export interface SimOptions {
  N?: number;
  T?: number;
  /** Evasion A: each round a colluder prices competitively with this probability. */
  eps?: number;
  /** Evasion B: colluder adds N(0, jitter) noise. */
  jitter?: number;
  /** Benchmark shift for the boom_parallel case only (Python default 0.3). */
  boomShift?: number;
  mu?: number;
  gamma?: number;
  /** Added to the benchmark mean in every case (Playground "boom shift"). */
  benchShift?: number;
  /** Overrides the case's default talk: collusive = the pair is flagged at FLAG_TP. */
  talk?: 'none' | 'collusive' | 'benign';
}

export interface Episode {
  p: Matrix;
  b: number[];
  flags: Matrix;
  pair: [number, number];
  label: 0 | 1;
  case: CaseName;
}

export function episode(c: CaseName, rng: Rng, opts: SimOptions = {}): Episode {
  const { N = 4, T = 30, eps = 0, jitter = 0, boomShift = 0.3, mu = MU, gamma = GAMMA, benchShift = 0, talk } = opts;
  const pair = rng.pair(N);
  const meanB = 0.3 + (c === 'boom_parallel' ? boomShift : 0) + benchShift;
  const collusiveTalk = talk ? talk === 'collusive' : c === 'cartel_talk' || c === 'talk_no_action';
  const b = new Array<number>(T);
  b[0] = meanB;
  for (let t = 1; t < T; t++) b[t] = meanB + 0.8 * (b[t - 1] - meanB) + rng.normal(0, 0.05);
  const flags: Matrix = Array.from({ length: T }, () => Array.from({ length: N }, () => (rng.random() < FLAG_FP ? 1 : 0)));
  const p: Matrix = Array.from({ length: T }, () => new Array<number>(N).fill(0));
  const colluding = c.startsWith('cartel');
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) {
      const base = b[t] + rng.normal(0, SIGMA);
      if (colluding && (i === pair[0] || i === pair[1])) {
        const j = i === pair[0] ? pair[1] : pair[0];
        let price: number;
        if (c === 'cartel_static' || t === 0) {
          price = b[t] + mu + rng.normal(0, SIGMA);
        } else {
          const dev = p[t - 1][j] - (b[t - 1] + mu); // partner's last deviation
          price = b[t] + mu + gamma * dev + rng.normal(0, SIGMA);
        }
        price += jitter > 0 ? rng.normal(0, jitter) : 0;
        if (rng.random() < eps) price = base; // mask: behave competitively
        p[t][i] = price;
      } else {
        p[t][i] = base;
      }
    }
    for (let i = 0; i < N; i++) p[t][i] = Math.min(1, Math.max(0, p[t][i]));
    if (collusiveTalk) {
      for (const i of pair) flags[t][i] = rng.random() < FLAG_TP ? 1 : 0;
    }
  }
  return { p, b, flags, pair, label: CASES[c].label, case: c };
}

/** Fraction of the cartel markup the colluding pair actually earns (1 = full cartel). */
export function retainedMarkup(ep: Episode, mu = MU): number {
  const [i, j] = ep.pair;
  let s = 0;
  for (let t = 0; t < ep.p.length; t++) s += ep.p[t][i] - ep.b[t] + (ep.p[t][j] - ep.b[t]);
  return s / (2 * ep.p.length) / mu;
}
