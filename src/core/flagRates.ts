// Per-case flag rates over simulated episodes (as run_synthetic.flag_table).
import { allScores, evaluatePlusFactor, type Thresholds } from './detectors';
import { makeRng } from './rng';
import { CASE_NAMES, episode, type CaseName, type SimOptions } from './sim';

export const DETECTORS = ['outcome', 'talk', 'corr', 'influence'] as const;
export type FlagRow = Record<(typeof DETECTORS)[number] | 'plus_factor', number>;

export function flagTable(
  seed: number,
  n: number,
  single: Required<Thresholds>,
  pf: Thresholds,
  opts: SimOptions = {},
  cases: readonly CaseName[] = CASE_NAMES,
): Record<string, FlagRow> {
  const rng = makeRng(seed);
  const out: Record<string, FlagRow> = {};
  for (const c of cases) {
    const row: FlagRow = { outcome: 0, talk: 0, corr: 0, influence: 0, plus_factor: 0 };
    for (let k = 0; k < n; k++) {
      const ep = episode(c, rng, opts);
      const s = allScores(ep.p, ep.b, ep.flags);
      for (const d of DETECTORS) if ((s[d] as number) > single[d]) row[d]++;
      if (evaluatePlusFactor(s, pf).plusFactor) row.plus_factor++;
    }
    for (const key of Object.keys(row) as (keyof FlagRow)[]) row[key] /= n;
    out[c] = row;
  }
  return out;
}
