// SPEC 9.1-9.3: value parity with the Python reference.
import { describe, expect, it } from 'vitest';
import { allScores, corrScore, evaluatePlusFactor, influenceScore, outcomeScore, talkScore, collusionIndex } from '../src/core/detectors';
import { absDask, meanMessageLength, restOfMarketInfluence } from '../src/core/realInfluence';
import { parseCsv } from '../src/core/parse';
import { loadJson, readText } from './helpers';

const TOL = 1e-9;
const close = (a: number, b: number, tol = TOL) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol);

describe('synthetic parity (fixtures/synthetic_parity.json)', () => {
  const fx = loadJson('fixtures/synthetic_parity.json');
  it('has 35 episodes', () => expect(fx.episodes.length).toBe(35));
  fx.episodes.forEach((ep: any, k: number) => {
    it(`${k}: ${ep.case}`, () => {
      const e = ep.expected;
      const s = allScores(ep.p, ep.b, ep.flags);
      close(s.outcome, e.outcome);
      close(s.talk!, e.talk);
      close(s.corr, e.corr);
      close(s.influence, e.influence);
      expect(s.predPair).toEqual(e.pred_pair);
      s.influenceMatrix.forEach((row, i) => row.forEach((v, j) => close(v, e.influence_matrix[i][j])));
      const nob = influenceScore(ep.p, null);
      close(nob.score, e.influence_without_benchmark);
      expect(nob.pair).toEqual(e.pred_pair_without_benchmark);
      const single = Object.fromEntries(
        (['outcome', 'talk', 'corr', 'influence'] as const).map((key) => [key, (s[key] as number) > fx.thresholds[key]]),
      );
      expect(single).toEqual(e.single_flags);
      const pf = evaluatePlusFactor(s, fx.plus_factor_thresholds);
      expect(pf.plusFactor).toBe(e.plus_factor);
      expect(pf.profile).toBe(e.profile);
    });
  });
});

describe('edge-case parity (fixtures/edge_cases.json)', () => {
  const fx = loadJson('fixtures/edge_cases.json');
  fx.edge_cases.forEach((ec: any) => {
    it(ec.name, () => {
      const e = ec.expected;
      close(outcomeScore(ec.p), e.outcome);
      close(talkScore(ec.flags), e.talk);
      close(corrScore(ec.p), e.corr);
      const inf = influenceScore(ec.p, ec.b);
      close(inf.score, e.influence);
      expect(inf.pair).toEqual(e.pred_pair);
    });
  });
});

describe('real-log parity (fixtures/real_parity.json)', () => {
  const fx = loadJson('fixtures/real_parity.json');
  fx.real_runs.forEach((run: any) => {
    it(run.run, () => {
      const e = run.expected;
      close(collusionIndex(run.asks, run.ce, run.jpm), e.outcome, 1e-6);
      close(restOfMarketInfluence(run.asks, run.bids).score, e.influence, 1e-6);
      close(absDask(run.asks), e.abs_dask, 1e-6);
    });
  });

  // The fixture carries per-round means rounded to 2 dp, not the raw messages, so msg_len is
  // checked on the one run whose messages ship as a sample CSV.
  it('msg_len for boss_pressure-oversight-2 from samples/real_pressure_oversight_run2.csv', () => {
    const run = fx.real_runs.find((r: any) => r.run.endsWith('boss_pressure-oversight-2'));
    const res = parseCsv(readText('samples/real_pressure_oversight_run2.csv'), 'restOfMarket');
    expect(res.errors).toEqual([]);
    close(meanMessageLength(res.log!.messages!), run.expected.msg_len, 1e-6);
    close(collusionIndex(res.log!.p, run.ce, run.jpm), run.expected.outcome, 1e-6);
    close(absDask(res.log!.p), run.expected.abs_dask, 1e-6);
  });
});
