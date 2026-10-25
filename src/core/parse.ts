// CSV (long format) -> Episode, with validation (SPEC 5.1, 5.2).
// Row numbers in messages count the header as row 1, as a spreadsheet does.
import Papa from 'papaparse';
import type { Matrix } from './detectors';

export type Mode = 'pairwise' | 'restOfMarket';

export interface ParsedLog {
  agents: string[];
  rounds: number[];
  /** p[t][i]; NaN where missing. */
  p: Matrix;
  benchmark: number[] | null;
  flags: Matrix | null;
  messages: string[][] | null;
  bids: number[] | null;
  /** True if every observed price is equal. */
  constant: boolean;
  /** True if some price lies outside [0, 1]. */
  outsideUnit: boolean;
}

export interface ParseResult {
  log: ParsedLog | null;
  errors: string[];
  warnings: string[];
}

export const MAX_AGENTS = 12;
export const MIN_RELIABLE_T = 20;
export const MAX_MISSING_SHARE = 0.2;

const REQUIRED = ['round', 'agent', 'price'] as const;

function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  if (t === '') return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : NaN;
}

const agentOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function parseCsv(text: string, mode: Mode = 'pairwise'): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const cols = parsed.meta.fields ?? [];
  const missingCols = REQUIRED.filter((c) => !cols.includes(c));
  if (missingCols.length) {
    return { log: null, errors: [`Missing required column(s): ${missingCols.join(', ')}.`], warnings };
  }
  const has = (c: string) => cols.includes(c);

  interface Row { round: number; agent: string; price: number; benchmark: number | null; flagged: number | null; message: string; bid: number | null }
  const seen = new Map<string, Row>();
  let duplicates = 0;
  let missingPrice = 0;

  parsed.data.forEach((r, k) => {
    const rowNo = k + 2;
    const round = num(r.round);
    const agent = (r.agent ?? '').trim();
    if (round === null || Number.isNaN(round)) { errors.push(`Row ${rowNo}: round "${r.round ?? ''}" is not a number.`); return; }
    if (!agent) { errors.push(`Row ${rowNo}: agent is empty.`); return; }
    let price = num(r.price);
    if (price === null) { missingPrice++; price = NaN; }
    else if (Number.isNaN(price)) { errors.push(`Row ${rowNo}: price "${r.price}" is not a number.`); return; }
    else if (price < 0) { errors.push(`Row ${rowNo}: price ${price} is negative.`); return; }

    let benchmark: number | null = null;
    if (has('benchmark')) {
      benchmark = num(r.benchmark);
      if (benchmark !== null && Number.isNaN(benchmark)) { errors.push(`Row ${rowNo}: benchmark "${r.benchmark}" is not a number.`); return; }
    }
    let flagged: number | null = null;
    if (has('flagged')) {
      const f = (r.flagged ?? '').trim();
      if (f !== '0' && f !== '1') { errors.push(`Row ${rowNo}: flagged must be 0 or 1, got "${f}".`); return; }
      flagged = Number(f);
    }
    let bid: number | null = null;
    if (has('bid')) {
      bid = num(r.bid);
      if (bid !== null && Number.isNaN(bid)) { errors.push(`Row ${rowNo}: bid "${r.bid}" is not a number.`); return; }
    }
    const key = `${round}\u0000${agent}`;
    if (seen.has(key)) { duplicates++; return; }
    seen.set(key, { round, agent, price, benchmark, flagged, message: r.message ?? '', bid });
  });

  if (errors.length) return { log: null, errors, warnings };
  if (duplicates) warnings.push(`${duplicates} duplicate (round, agent) row(s) found; kept the first of each.`);

  const rows = [...seen.values()].sort((a, b) => a.round - b.round || agentOrder(a.agent, b.agent));
  const agents = [...new Set(rows.map((r) => r.agent))].sort(agentOrder);
  const rounds = [...new Set(rows.map((r) => r.round))].sort((a, b) => a - b);
  const N = agents.length;
  const T = rounds.length;
  if (N < 2) return { log: null, errors: [`Found ${N} agent(s); at least 2 are needed.`], warnings };
  if (N > MAX_AGENTS) {
    return { log: null, errors: [`Found ${N} agents; pairwise detectors are not meaningful at this size in v1 (maximum ${MAX_AGENTS}).`], warnings };
  }

  const ai = new Map(agents.map((a, i) => [a, i]));
  const ti = new Map(rounds.map((r, t) => [r, t]));
  const p: Matrix = Array.from({ length: T }, () => new Array<number>(N).fill(NaN));
  const flags: Matrix | null = has('flagged') ? Array.from({ length: T }, () => new Array<number>(N).fill(NaN)) : null;
  const messages: string[][] | null = has('message') ? Array.from({ length: T }, () => new Array<string>(N).fill('')) : null;
  const benchVals: number[][] = Array.from({ length: T }, () => []);
  const bidVals: number[][] = Array.from({ length: T }, () => []);
  for (const r of rows) {
    const t = ti.get(r.round)!;
    const i = ai.get(r.agent)!;
    p[t][i] = r.price;
    if (flags) flags[t][i] = r.flagged!;
    if (messages) messages[t][i] = r.message;
    if (r.benchmark !== null) benchVals[t].push(r.benchmark);
    if (r.bid !== null) bidVals[t].push(r.bid);
  }

  const absent = T * N - rows.length;
  if (missingPrice + absent > 0) {
    warnings.push(`${missingPrice + absent} price(s) missing (empty cell or no row for that round and agent); treated as missing.`);
  }
  const tooSparse = agents.filter((_, i) => p.filter((row) => !Number.isFinite(row[i])).length > MAX_MISSING_SHARE * T);
  if (tooSparse.length && mode === 'pairwise') {
    return {
      log: null,
      errors: [`Agent(s) ${tooSparse.join(', ')} miss more than 20% of rounds. Pairwise detectors need near-complete logs; try auction mode, which tolerates gaps.`],
      warnings,
    };
  }

  const perRound = (vals: number[][], name: string): number[] | null => {
    if (!vals.some((v) => v.length)) return null;
    let mixed = 0;
    const out = vals.map((v, t) => {
      if (!v.length) { errors.push(`Round ${rounds[t]}: ${name} is missing.`); return NaN; }
      if (v.some((x) => x !== v[0])) mixed++;
      return v.reduce((a, b) => a + b, 0) / v.length;
    });
    if (mixed) warnings.push(`${mixed} round(s) have different ${name} values across agents; used the mean for each round.`);
    return out;
  };
  const benchmark = perRound(benchVals, 'benchmark');
  const bids = perRound(bidVals, 'bid');
  if (errors.length) return { log: null, errors, warnings };

  const gaps = rounds.some((r, t) => t > 0 && r - rounds[t - 1] !== 1);
  if (gaps) warnings.push('Round numbers are not consecutive; rounds are used in sorted order.');
  if (T < MIN_RELIABLE_T) {
    warnings.push(`Only ${T} rounds. Influence is unreliable below ${MIN_RELIABLE_T} rounds and is left out of the plus-factor rule.`);
  }
  const observed = p.flat().filter(Number.isFinite);
  const constant = observed.length > 0 && observed.every((x) => x === observed[0]);
  if (constant) warnings.push('No price variation: every price is the same.');
  const outsideUnit = observed.some((x) => x > 1);

  return {
    log: { agents, rounds, p, benchmark, flags, messages, bids, constant, outsideUnit },
    errors,
    warnings,
  };
}
