// Worker request handler (src/workerApi.ts) and the Playground simulator options.
import { describe, expect, it } from 'vitest';
import { handle } from '../src/workerApi';
import { makeRng } from '../src/core/rng';
import { episode } from '../src/core/sim';
import { FROZEN_PLUS_FACTOR } from '../src/core/detectors';

describe('simulator options', () => {
  it('demandShift 0.3 on competitive reproduces boom_parallel', () => {
    expect(episode('competitive', makeRng(5), { demandShift: 0.3 }).p).toEqual(episode('boom_parallel', makeRng(5)).p);
  });
  it("talk 'collusive' on competitive reproduces talk_no_action flags", () => {
    expect(episode('competitive', makeRng(5), { talk: 'collusive' }).flags).toEqual(episode('talk_no_action', makeRng(5)).flags);
  });
  it("talk 'benign' on cartel_talk has only false-positive flags", () => {
    const a = episode('cartel_talk', makeRng(6), { talk: 'benign' });
    expect(a.flags).toEqual(episode('cartel_tacit', makeRng(6)).flags);
  });
  it("talk 'none' clears all flags", () => {
    expect(episode('cartel_talk', makeRng(6), { talk: 'none' }).flags.flat().every((x) => x === 0)).toBe(true);
  });
});

describe('worker handler', () => {
  it('uses frozen thresholds at T=30, N=4', () => {
    const r = handle({ type: 'playground', case: 'cartel_tacit', sim: {}, seed: 1, n: 50 });
    if (r.type !== 'playground') throw new Error();
    expect(r.result.thresholdSet).toBe('frozen');
    expect(r.result.thresholds.plusFactor).toEqual(FROZEN_PLUS_FACTOR);
    expect(r.result.retainedMarkup).toBeGreaterThan(0.8);
    expect(r.result.example.episode.p.length).toBe(30);
  });
  it('calibrates otherwise and labels the set', () => {
    const r = handle({ type: 'playground', case: 'competitive', sim: { T: 20, N: 3 }, seed: 1, n: 20 });
    if (r.type !== 'playground') throw new Error();
    expect(r.result.thresholdSet).toBe('calibrated');
    expect(r.result.calibration).toMatchObject({ T: 20, N: 3, episodes: 600 });
    expect(r.result.retainedMarkup).toBeNull();
  });
  it("reports talk as not available when talk mode is 'none'", () => {
    const r = handle({ type: 'playground', case: 'cartel_talk', sim: { talk: 'none' }, seed: 1, n: 10 });
    if (r.type !== 'playground') throw new Error();
    expect(r.result.rates.talk).toBeNull();
    expect(r.result.example.scores.talk).toBeNull();
  });
  it('is deterministic for a seed', () => {
    const req = { type: 'playground' as const, case: 'cartel_static' as const, sim: {}, seed: 9, n: 30 };
    expect(handle(req)).toEqual(handle(req));
  });
  it('runs a calibration request', () => {
    const r = handle({ type: 'calibrate', T: 25, N: 4, seed: 2 });
    expect(r.type === 'calibrate' && r.result.T).toBe(25);
  });
});
