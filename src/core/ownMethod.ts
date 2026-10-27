// Test your own detector: export labelled simulated markets, then score the flags a detector produced.
// Nothing here makes a network call. Pasted code runs in a locked-down worker (see sandbox.ts).
import Papa from 'papaparse';
import { allScores, evaluatePlusFactor, FROZEN_PLUS_FACTOR, FROZEN_SINGLE, type Matrix, type Thresholds } from './detectors';
import { makeRng } from './rng';
import { CASE_NAMES, CASES, episode, type CaseName, type Episode } from './sim';

export const DETECTOR_KEYS = ['outcome', 'talk', 'corr', 'influence', 'plus_factor'] as const;

export interface BenchSettings {
  seed: number;
  /** Markets per case. */
  perCase: number;
  T: number;
  N: number;
}

export interface BenchMarket extends Episode {
  /** Unique id: `${case}-${index}`. */
  id: string;
}

export const DEFAULT_BENCH: BenchSettings = { seed: 20260101, perCase: 50, T: 30, N: 4 };

/** Same seed and settings always give the same markets, so an offline run can be scored later. */
export function makeBench(s: BenchSettings, cases: readonly CaseName[] = CASE_NAMES): BenchMarket[] {
  const rng = makeRng(s.seed);
  const out: BenchMarket[] = [];
  for (const c of cases) for (let k = 0; k < s.perCase; k++) out.push({ ...episode(c, rng, { T: s.T, N: s.N }), id: `${c}-${k + 1}` });
  return out;
}

/** Long CSV, one row per market, round and seller. `label` is the truth (1 = cartel); `true_pair` is the cartel pair. */
export function benchToCsv(markets: BenchMarket[]): string {
  const rows: Record<string, string | number>[] = [];
  for (const m of markets) {
    m.p.forEach((row, t) =>
      row.forEach((price, i) =>
        rows.push({
          market_id: m.id,
          case: m.case,
          label: m.label,
          true_pair: m.label ? `${m.pair[0] + 1}-${m.pair[1] + 1}` : '',
          round: t + 1,
          agent: `agent_${i + 1}`,
          price: Number(price.toFixed(6)),
          benchmark: Number(m.b[t].toFixed(6)),
          flagged: m.flags[t][i],
        }),
      ),
    );
  }
  return Papa.unparse(rows);
}

/** The five detectors from the paper, run on the same markets, as flag arrays (1 = flagged). */
export function ourFlags(markets: BenchMarket[], single: Required<Thresholds> = FROZEN_SINGLE, pf: Thresholds = FROZEN_PLUS_FACTOR): Record<(typeof DETECTOR_KEYS)[number], number[]> {
  const out = { outcome: [] as number[], talk: [] as number[], corr: [] as number[], influence: [] as number[], plus_factor: [] as number[] };
  for (const m of markets) {
    const s = allScores(m.p, m.b, m.flags);
    out.outcome.push(s.outcome > single.outcome ? 1 : 0);
    out.talk.push((s.talk as number) > single.talk ? 1 : 0);
    out.corr.push(s.corr > single.corr ? 1 : 0);
    out.influence.push(s.influence > single.influence ? 1 : 0);
    out.plus_factor.push(evaluatePlusFactor(s, pf).plusFactor ? 1 : 0);
  }
  return out;
}

export interface FlagsParse {
  /** market id -> 1 or 0 */
  flags: Map<string, number>;
  errors: string[];
  warnings: string[];
}

/** Read the user's results: columns `market_id` and `flag` (0/1). A `score` column is not used. */
export function parseFlagsCsv(text: string, markets: BenchMarket[]): FlagsParse {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const cols = parsed.meta.fields ?? [];
  if (!cols.includes('market_id') || !cols.includes('flag')) {
    return { flags: new Map(), errors: ['Needs two columns: market_id and flag (1 = your method flags the market, 0 = it does not).'], warnings };
  }
  const known = new Set(markets.map((m) => m.id));
  const flags = new Map<string, number>();
  parsed.data.forEach((r, k) => {
    const row = k + 2;
    const id = (r.market_id ?? '').trim();
    const f = (r.flag ?? '').trim().toLowerCase();
    const v = f === '1' || f === 'true' ? 1 : f === '0' || f === 'false' ? 0 : null;
    if (v === null) { errors.push(`Row ${row}: flag must be 0 or 1, got "${r.flag ?? ''}".`); return; }
    if (!known.has(id)) { errors.push(`Row ${row}: market_id "${id}" is not in the benchmark. Check the seed, markets per case, rounds and sellers match the file you downloaded.`); return; }
    if (flags.has(id)) { warnings.push(`Row ${row}: market ${id} appears twice; kept the first.`); return; }
    flags.set(id, v);
  });
  const missing = markets.filter((m) => !flags.has(m.id)).length;
  if (missing && !errors.length) errors.push(`${missing} of ${markets.length} markets have no flag. Every market needs one row.`);
  return { flags, errors: errors.slice(0, 5), warnings: warnings.slice(0, 3) };
}

export interface CaseRates {
  case: CaseName;
  label: 0 | 1;
  n: number;
  /** Fraction flagged per detector key, plus `yours`. */
  rates: Record<string, number>;
}

export interface Scorecard {
  rows: CaseRates[];
  /** Per detector: mean flag rate over cartel cases (TPR) and innocent cases (FPR), plus worst cases. */
  summary: Record<string, { tpr: number; fpr: number; worstMiss: { case: CaseName; rate: number }; worstFalseAlarm: { case: CaseName; rate: number } }>;
}

export function scorecard(markets: BenchMarket[], flagsByName: Record<string, number[]>): Scorecard {
  const names = Object.keys(flagsByName);
  const cases = [...new Set(markets.map((m) => m.case))];
  const rows: CaseRates[] = cases.map((c) => {
    const idx = markets.map((m, i) => (m.case === c ? i : -1)).filter((i) => i >= 0);
    const rates: Record<string, number> = {};
    for (const nme of names) rates[nme] = idx.reduce((a, i) => a + flagsByName[nme][i], 0) / idx.length;
    return { case: c, label: CASES[c].label, n: idx.length, rates };
  });
  const summary: Scorecard['summary'] = {};
  for (const nme of names) {
    const pos = rows.filter((r) => r.label === 1);
    const neg = rows.filter((r) => r.label === 0);
    const mean = (rs: CaseRates[]) => (rs.length ? rs.reduce((a, r) => a + r.rates[nme], 0) / rs.length : NaN);
    const worstMiss = pos.reduce((w, r) => (w === null || r.rates[nme] < w.rate ? { case: r.case, rate: r.rates[nme] } : w), null as null | { case: CaseName; rate: number });
    const worstFalseAlarm = neg.reduce((w, r) => (w === null || r.rates[nme] > w.rate ? { case: r.case, rate: r.rates[nme] } : w), null as null | { case: CaseName; rate: number });
    summary[nme] = { tpr: mean(pos), fpr: mean(neg), worstMiss: worstMiss ?? { case: 'cartel_talk', rate: NaN }, worstFalseAlarm: worstFalseAlarm ?? { case: 'competitive', rate: NaN } };
  }
  return { rows, summary };
}

/** What a pasted function receives. Plain arrays only; no functions or references to the page. */
export interface MarketInput {
  prices: Matrix;
  benchmark: number[];
  flags: Matrix;
  rounds: number;
  sellers: number;
}

export function toInput(m: Episode): MarketInput {
  return { prices: m.p, benchmark: m.b, flags: m.flags, rounds: m.p.length, sellers: m.p[0].length };
}
