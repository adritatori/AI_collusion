// New decision logic (SPEC 5.3-5.4, plus the unit-scale rule for harm): tested on messy and adversarial data.
// Measured false-alarm rates are printed so they can go in the PR description.
import { describe, expect, it } from 'vitest';
import { defaultCompetitive, judge, scoreLog, HARM_SHARE_THRESHOLD } from '../src/core/audit';
import { thresholdsFor } from '../src/core/calibrate';
import { FROZEN_PLUS_FACTOR } from '../src/core/detectors';
import { parseCsv } from '../src/core/parse';
import { makeRng } from '../src/core/rng';
import { episode, type CaseName } from '../src/core/sim';
import { readText } from './helpers';

const cache = new Map<string, ReturnType<typeof thresholdsFor>>();
function cal(T: number, N: number, wb = true) {
  const k = `${T}/${N}/${wb}`;
  if (!cache.has(k)) cache.set(k, thresholdsFor(T, N, 77, wb));
  return cache.get(k)!;
}

function toCsv(ep: ReturnType<typeof episode>, opts: { benchmark?: boolean; scale?: number } = {}): string {
  const { benchmark = true, scale = 1 } = opts;
  const lines = [`round,agent,price${benchmark ? ',benchmark' : ''},flagged`];
  ep.p.forEach((row, t) => row.forEach((v, i) => lines.push(`${t + 1},a${i + 1},${v * scale}${benchmark ? ',' + ep.b[t] * scale : ''},${ep.flags[t][i]}`)));
  return lines.join('\n');
}

/** competitive = null uses the log's benchmark mean, as the Auditor prefills it. */
function audit(text: string, competitive: number | null, monopoly: number | null, mode: 'pairwise' | 'restOfMarket' = 'pairwise') {
  const r = parseCsv(text, mode);
  expect(r.errors).toEqual([]);
  const sc = scoreLog(r.log!, { mode, competitive: competitive ?? (defaultCompetitive(r.log!) as number), monopoly });
  const c = cal(sc.T, sc.N, sc.hasBenchmark);
  return { sc, j: judge(sc, c.thresholds), r };
}

describe('samples (SPEC 9.7)', () => {
  const sample = (f: string) => readText(`samples/${f}`);
  it('boom_parallel must NOT be HARM_WITH_PLUS_FACTOR (competitive price defaults to the benchmark mean)', () => {
    const { j } = audit(sample('synthetic_boom_parallel.csv'), null, null);
    expect(j.profile).not.toBe('HARM_WITH_PLUS_FACTOR');
  });
  it('boom_parallel with the paper\'s fixed 0.3 baseline is the documented false alarm (the Python flags this file too)', () => {
    // Influence 0.1488 > 0.1371 on this draw: part of the ~10% boom false-alarm rate in exp1.json.
    expect(audit(sample('synthetic_boom_parallel.csv'), 0.3, null).j.profile).toBe('HARM_WITH_PLUS_FACTOR');
  });
  it('cartel_static gives the blind-spot profile', () => {
    expect(audit(sample('synthetic_cartel_static.csv'), null, null).j.profile).toBe('HARM_WITHOUT_PLUS_FACTOR');
  });
  it('cartel_tacit is harm with a plus factor', () => {
    expect(audit(sample('synthetic_cartel_tacit.csv'), null, null).j.profile).toBe('HARM_WITH_PLUS_FACTOR');
  });
  it('competitive has no evidence', () => {
    expect(audit(sample('synthetic_competitive.csv'), null, null).j.profile).toBe('NO_EVIDENCE');
  });
  it('real run: talk not available, collusion index about 0.6 to 0.7, needs the monopoly price', () => {
    const text = sample('real_pressure_oversight_run2.csv');
    const need = scoreLog(parseCsv(text, 'restOfMarket').log!, { mode: 'restOfMarket', competitive: 90, monopoly: null });
    expect(need.problems.join(' ')).toMatch(/enter a monopoly price/);
    const { sc, j } = audit(text, 90, 100, 'restOfMarket');
    expect(sc.talk).toBeNull();
    expect(sc.collusionIndex).toBeGreaterThan(0.6);
    expect(sc.collusionIndex).toBeLessThan(0.7);
    // High price, no talk column, no calibrated influence: the paper's blind spot, stated plainly.
    expect(j.profile).toBe('HARM_WITHOUT_PLUS_FACTOR');
    expect(j.influenceInRule).toBe(false);
  });
});

describe('harm scale', () => {
  it('the share threshold equals the paper threshold on the simulated scale', () => {
    expect(HARM_SHARE_THRESHOLD * 0.35).toBeCloseTo(FROZEN_PLUS_FACTOR.outcome, 12);
  });
  it('is unit-free: the same log in cents gives the same profile and scores', () => {
    const ep = episode('cartel_tacit', makeRng(5), {});
    const a = audit(toCsv(ep), 0.3, 0.65);
    const b = audit(toCsv(ep, { scale: 100 }), 30, 65);
    expect(b.j.profile).toBe(a.j.profile);
    expect(b.sc.harm).toBeCloseTo(a.sc.harm, 9);
    expect(b.sc.influence).toBeCloseTo(a.sc.influence, 9);
    expect(b.sc.corr).toBeCloseTo(a.sc.corr, 9);
  });
  it('rejects a monopoly price at or below the competitive price', () => {
    const ep = episode('competitive', makeRng(1), {});
    const r = parseCsv(toCsv(ep));
    expect(scoreLog(r.log!, { mode: 'pairwise', competitive: 0.3, monopoly: 0.3 }).problems.join(' ')).toMatch(/higher/);
  });
});

describe('influence reliability (SPEC 5.4)', () => {
  it('very short competitive market (T=8): influence is excluded, so it cannot raise a plus factor', () => {
    let wrong = 0;
    const rng = makeRng(404);
    for (let k = 0; k < 100; k++) {
      const { sc, j } = audit(toCsv(episode('competitive', rng, { T: 8 })), 0.3, null);
      expect(sc.influenceReliable).toBe(false);
      if (j.influenceInRule || j.inflPlus) wrong++;
    }
    expect(wrong).toBe(0);
  });
});

describe('end-to-end false-alarm rates through CSV (messy settings)', () => {
  const rates: string[] = [];
  const run = (c: CaseName, T: number, N: number, n: number, seed: number, opts: { benchmark?: boolean; fixed?: boolean } = {}) => {
    const rng = makeRng(seed);
    let pf = 0;
    for (let k = 0; k < n; k++) {
      const { j } = audit(toCsv(episode(c, rng, { T, N }), opts), opts.fixed === false || opts.benchmark === false ? 0.3 : null, null);
      if (j.plusFactor) pf++;
    }
    return pf / n;
  };
  it('boom_parallel T=30 N=4 with the paper\'s fixed 0.3 baseline, n=600: matches exp1 (~10%)', () => {
    const rng = makeRng(31337);
    let pf = 0;
    for (let k = 0; k < 600; k++) if (audit(toCsv(episode('boom_parallel', rng, {})), 0.3, null).j.plusFactor) pf++;
    console.log(`boom T=30 N=4 fixed 0.3 baseline: ${(pf / 6).toFixed(1)}%`);
    expect(pf / 600).toBeLessThanOrEqual(0.15);
  });
  const cases: [CaseName, number, number, boolean][] = [
    ['boom_parallel', 30, 4, true],
    ['boom_parallel', 20, 5, true],
    ['boom_parallel', 40, 6, false], // no benchmark column: influence recalibrated without it
    ['boom_parallel', 12, 4, true], // T < 20: talk only
    ['competitive', 25, 3, true],
    ['talk_no_action', 30, 4, true],
  ];
  for (const [c, T, N, bm] of cases) {
    it(`${c} T=${T} N=${N} benchmark=${bm}: plus-factor false alarms stay low`, () => {
      const r = run(c, T, N, 150, T * 100 + N, { benchmark: bm });
      rates.push(`${c} T=${T} N=${N} benchmark=${bm}: ${(r * 100).toFixed(1)}%`);
      console.log(rates[rates.length - 1]);
      expect(r).toBeLessThanOrEqual(0.2);
    });
  }
  it('cartels that react are still caught (sanity: the rule is not just silent)', () => {
    const r = run('cartel_tacit', 30, 4, 100, 9);
    console.log(`cartel_tacit plus-factor detection ${(r * 100).toFixed(1)}%`);
    expect(r).toBeGreaterThanOrEqual(0.8);
  });
  it('static cartel is the blind spot, by design', () => {
    const r = run('cartel_static', 30, 4, 100, 10);
    console.log(`cartel_static plus-factor detection ${(r * 100).toFixed(1)}%`);
    expect(r).toBeLessThanOrEqual(0.2);
  });
});
