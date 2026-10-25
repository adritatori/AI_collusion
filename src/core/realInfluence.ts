// Rest-of-market metrics for auction-style logs (port of run_real.py, SPEC 4.5).
import { partialR2 } from './linalg';
import type { Matrix } from './detectors';

const finite = (x: number) => Number.isFinite(x);

function nanMean(xs: number[]): number {
  let s = 0;
  let n = 0;
  for (const x of xs) if (finite(x)) { s += x; n++; }
  return n ? s / n : NaN;
}

export interface RestOfMarket {
  /** Mean over sellers of the partial R^2; NaN if no seller has more than 8 usable rows. */
  score: number;
  perSeller: (number | null)[];
}

/** Partial R^2 of mean(other sellers' ask[t-1]) for ask[t], base = [1, own ask[t-1], mean bid[t-1]]. */
export function restOfMarketInfluence(asks: Matrix, bids: number[] | null): RestOfMarket {
  const T = asks.length;
  const N = asks[0].length;
  const perSeller: (number | null)[] = [];
  for (let i = 0; i < N; i++) {
    const others = asks.map((row) => nanMean(row.filter((_, k) => k !== i)));
    const y: number[] = [], one: number[] = [], own: number[] = [], bid: number[] = [], ex: number[] = [];
    for (let t = 1; t < T; t++) {
      const row = [asks[t][i], asks[t - 1][i], bids ? bids[t - 1] : 0, others[t - 1]];
      if (!row.every(finite)) continue;
      y.push(row[0]); one.push(1); own.push(row[1]); bid.push(row[2]); ex.push(row[3]);
    }
    if (y.length > 8) perSeller.push(partialR2(y, bids ? [one, own, bid] : [one, own], ex));
    else perSeller.push(null);
  }
  const ok = perSeller.filter((x): x is number => x !== null);
  return { score: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : NaN, perSeller };
}

/** Mean absolute round-to-round change in ask, ignoring NaN. */
export function absDask(asks: Matrix): number {
  const d: number[] = [];
  for (let t = 1; t < asks.length; t++) for (let i = 0; i < asks[t].length; i++) d.push(Math.abs(asks[t][i] - asks[t - 1][i]));
  return nanMean(d);
}

/** Length in characters (Unicode code points, as Python's len). */
export function charLength(s: string): number {
  return Array.from(s).length;
}

/** Mean characters per non-empty message; 0 if there are none. */
export function meanMessageLength(messages: string[][]): number {
  const lens = messages.flat().filter((m) => m).map(charLength);
  return lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
}

/** Mean message length by round (empty messages count as 0, as in make_fixtures.py). */
export function messageLengthByRound(messages: string[][]): number[] {
  return messages.map((row) => row.reduce((a, m) => a + charLength(m), 0) / row.length);
}
