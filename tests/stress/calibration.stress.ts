// Stress test for length- and size-matched calibration (SPEC 5.3) and for applying the
// log's missing-row mask during calibration. Writes reports/calibration.md and .json.
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { calibrate, maskOf } from '../../src/core/calibrate';
import { allScores, evaluatePlusFactor, FROZEN_PLUS_FACTOR, type Matrix, type Thresholds } from '../../src/core/detectors';
import { makeRng, type Rng } from '../../src/core/rng';
import { episode, type CaseName, type Episode } from '../../src/core/sim';
import { maskAfterPartnerDeviation, maskRandom, rejectedByParser } from './masks';
import { coarseGrid, heavyTails, hiddenCommonShock, sticky } from './perturb';
import { rates } from './sweep';

const R = 5;          // independent calibrate -> fresh-seed replicates
const N_TEST = 300;   // test episodes per case per replicate
const f = (x: number) => x.toFixed(3);
const out: any = { grid: [], messy: [], missing: [] };
const lines: string[] = ['# Calibration stress test', ''];

type Row = { comp: number; boom: number; tacitI: number; tacitPF: number; compRuns: number[] };
function evalTh(thFor: (r: number) => Thresholds, T: number, N: number, tf?: (ep: Episode, rng: Rng) => Matrix, accept?: (p: Matrix) => boolean): Row {
  const row: Row = { comp: 0, boom: 0, tacitI: 0, tacitPF: 0, compRuns: [] };
  for (let r = 0; r < R; r++) {
    const th = thFor(r);
    const c = rates('competitive', N_TEST, makeRng(7000 + r), th, { T, N }, tf, accept).influence;
    row.compRuns.push(c);
    row.comp += c / R;
    row.boom += rates('boom_parallel', N_TEST, makeRng(8000 + r), th, { T, N }, tf, accept).plus_factor / R;
    const t = rates('cartel_tacit', N_TEST, makeRng(9000 + r), th, { T, N }, tf, accept);
    row.tacitI += t.influence / R;
    row.tacitPF += t.plus_factor / R;
  }
  return row;
}
const spread = (xs: number[]) => `${f(Math.min(...xs))}–${f(Math.max(...xs))}`;

it('calibration stress', () => {
  // 1. Clean data, grid over T and N.
  lines.push('## 1. Clean synthetic data: frozen vs calibrated thresholds', '',
    `${R} replicates × ${N_TEST} fresh episodes per case. FA = false-alarm rate. "range" = single-replicate min–max.`, '',
    '| T | N | Comp. influence FA (frozen) | Comp. influence FA (calibrated) | range | Boom plus-factor FA (frozen) | Boom plus-factor FA (calibrated) | Tacit influence detect (cal.) | Tacit plus-factor detect (cal.) |',
    '|---|---|---|---|---|---|---|---|---|');
  for (const N of [2, 4, 8]) for (const T of [8, 10, 15, 20, 25, 30, 60]) {
    const fro = evalTh(() => FROZEN_PLUS_FACTOR, T, N);
    const cal = evalTh((r) => calibrate(T, N, 100 + r).thresholds, T, N);
    out.grid.push({ T, N, frozen: fro, calibrated: cal });
    lines.push(`| ${T} | ${N} | ${f(fro.comp)} | ${f(cal.comp)} | ${spread(cal.compRuns)} | ${f(fro.boom)} | ${f(cal.boom)} | ${f(cal.tacitI)} | ${f(cal.tacitPF)} |`);
  }

  // 2. Messy innocent behaviour the calibration model does not include.
  const messy: [string, ((ep: Episode, rng: Rng) => Matrix) | undefined][] = [
    ['clean', undefined], ['heavy-tailed noise (t3 × 0.02)', heavyTails], ['hidden common demand shock', hiddenCommonShock],
    ['sticky pricing (half-way moves)', sticky], ['coarse price grid (0.05)', coarseGrid],
  ];
  lines.push('', '## 2. Messy data the calibration model does not include (calibrated thresholds)', '',
    '| T | Condition | Comp. influence FA | range | Boom plus-factor FA | Tacit influence detect | Tacit plus-factor detect |', '|---|---|---|---|---|---|---|');
  for (const T of [20, 30]) for (const [name, tf] of messy) {
    const cal = evalTh((r) => calibrate(T, 4, 100 + r).thresholds, T, 4, tf);
    out.messy.push({ T, name, ...cal });
    lines.push(`| ${T} | ${name} | ${f(cal.comp)} | ${spread(cal.compRuns)} | ${f(cal.boom)} | ${f(cal.tacitI)} | ${f(cal.tacitPF)} |`);
  }

  // 3. Missing prices: calibrate without vs with the log's own missing-row mask.
  lines.push('', '## 3. Missing prices: calibration without vs with the missing-row mask (T=30, N=4)', '',
    'Random: one accepted mask per replicate, used for calibration and for all its test episodes.',
    'Adversarial: rows hidden right after the partner\'s largest deviations; the mask differs per episode, so each test episode is calibrated on its own mask (60 per case).', '',
    '| Missing rows | Calibration | Comp. influence FA | Boom plus-factor FA | Tacit influence detect | Tacit plus-factor detect |', '|---|---|---|---|---|---|');
  const T = 30, N = 4;
  for (const q of [0.05, 0.1, 0.2]) {
    const masks: boolean[][][] = [];
    const mr = makeRng(4242 + q * 100);
    while (masks.length < R) { const m = maskRandom(Array.from({ length: T }, () => new Array(N).fill(0)), q, mr); if (!rejectedByParser(m)) masks.push(maskOf(m)); }
    const tfFor = (r: number) => (ep: Episode) => ep.p.map((row, t) => row.map((x, i) => (masks[r][t][i] ? NaN : x)));
    for (const withMask of [false, true]) {
      const row: Row = { comp: 0, boom: 0, tacitI: 0, tacitPF: 0, compRuns: [] };
      for (let r = 0; r < R; r++) {
        const th = calibrate(T, N, 100 + r, 300, withMask ? masks[r] : null).thresholds;
        const tf = tfFor(r);
        row.comp += rates('competitive', N_TEST, makeRng(7000 + r), th, { T, N }, tf).influence / R;
        row.boom += rates('boom_parallel', N_TEST, makeRng(8000 + r), th, { T, N }, tf).plus_factor / R;
        const tt = rates('cartel_tacit', N_TEST, makeRng(9000 + r), th, { T, N }, tf);
        row.tacitI += tt.influence / R; row.tacitPF += tt.plus_factor / R;
      }
      out.missing.push({ q, withMask, ...row });
      lines.push(`| random ${q * 100}% | ${withMask ? 'with mask' : 'no mask'} | ${f(row.comp)} | ${f(row.boom)} | ${f(row.tacitI)} | ${f(row.tacitPF)} |`);
    }
  }
  for (const k of [3, 6]) for (const withMask of [false, true]) {
    const res: Record<string, { i: number; pf: number }> = {};
    for (const c of ['competitive', 'boom_parallel', 'cartel_tacit'] as CaseName[]) {
      const rng = makeRng(31337); let i = 0, pf = 0; const n = 60;
      for (let e = 0; e < n; e++) {
        const ep = episode(c, rng, { T, N });
        const p = maskAfterPartnerDeviation(ep, k);
        const th = calibrate(T, N, 500 + e, 300, withMask ? maskOf(p) : null).thresholds;
        const s = allScores(p, ep.b, ep.flags);
        i += +(s.influence > th.influence); pf += +evaluatePlusFactor(s, th).plusFactor;
      }
      res[c] = { i: i / n, pf: pf / n };
    }
    out.missing.push({ adversarial: k, withMask, res });
    lines.push(`| adversarial ${k}/colluder | ${withMask ? 'with mask' : 'no mask'} | ${f(res.competitive.i)} | ${f(res.boom_parallel.pf)} | ${f(res.cartel_tacit.i)} | ${f(res.cartel_tacit.pf)} |`);
  }
  writeFileSync('reports/calibration.json', JSON.stringify(out, null, 1));
  writeFileSync('reports/calibration.md', lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}, 3_600_000);
