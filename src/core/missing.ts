// What the detectors leave out when prices are missing. The UI must always show this.
import type { Matrix } from './detectors';

const finite = (x: number) => Number.isFinite(x);

export interface MissingReport {
  /** Cells (round, agent) with no price. */
  missingCells: number;
  totalCells: number;
  perAgent: number[];
  /** Outcome skips the missing cells only. */
  outcomeCellsSkipped: number;
  /** Influence: regression rows dropped per ordered pair (i, j) out of T-1, because p_i(t),
   *  p_i(t-1), p_j(t-1) or b(t) is missing. */
  influenceRowsDropped: Matrix;
  influenceRowsMaxDropped: number;
  /** Correlation: price changes dropped per pair (i < j) out of T-1. */
  corrRowsDropped: Matrix;
  corrRowsMaxDropped: number;
  regressionRows: number;
}

export function missingReport(p: Matrix, b: number[] | null): MissingReport {
  const T = p.length;
  const N = p[0].length;
  const perAgent = Array.from({ length: N }, (_, i) => p.filter((r) => !finite(r[i])).length);
  const missingCells = perAgent.reduce((a, x) => a + x, 0);
  const infl: Matrix = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  const corr: Matrix = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      for (let t = 1; t < T; t++) {
        if (![p[t][i], p[t - 1][i], p[t - 1][j], b ? b[t] : 0].every(finite)) infl[i][j]++;
        if (i < j && ![p[t][i], p[t - 1][i], p[t][j], p[t - 1][j]].every(finite)) corr[i][j]++;
      }
    }
  return {
    missingCells,
    totalCells: T * N,
    perAgent,
    outcomeCellsSkipped: missingCells,
    influenceRowsDropped: infl,
    influenceRowsMaxDropped: Math.max(...infl.flat()),
    corrRowsDropped: corr,
    corrRowsMaxDropped: Math.max(...corr.flat()),
    regressionRows: T - 1,
  };
}

/** One plain sentence for the UI. */
export function describeMissing(r: MissingReport): string {
  if (r.missingCells === 0) return 'No missing prices: every round was used.';
  return (
    `${r.missingCells} of ${r.totalCells} prices are missing. ` +
    `Outcome skips those ${r.outcomeCellsSkipped} cells. ` +
    `Influence drops up to ${r.influenceRowsMaxDropped} of ${r.regressionRows} rounds for a pair, and correlation up to ${r.corrRowsMaxDropped}, ` +
    `because a price is missing in that round or the round before.`
  );
}
