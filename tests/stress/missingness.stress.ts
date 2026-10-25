// Stress test for dropping incomplete rows (missing prices). Frozen thresholds, T=30, N=4.
// Writes reports/missingness.md and reports/missingness.json.
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { allScores, evaluatePlusFactor, FROZEN_PLUS_FACTOR, FROZEN_SINGLE, type Matrix } from '../../src/core/detectors';
import { makeRng } from '../../src/core/rng';
import { episode, type CaseName } from '../../src/core/sim';
import { maskAfterPartnerDeviation, maskRandom, rejectedByParser } from './masks';

const N_EP = 1000;
const CASES: CaseName[] = ['competitive', 'boom_parallel', 'cartel_tacit'];
type Cond = { name: string; mask: (ep: ReturnType<typeof episode>, rng: ReturnType<typeof makeRng>) => Matrix };
const CONDS: Cond[] = [
  { name: 'complete', mask: (ep) => ep.p },
  { name: 'random 5%', mask: (ep, r) => maskRandom(ep.p, 0.05, r) },
  { name: 'random 10%', mask: (ep, r) => maskRandom(ep.p, 0.1, r) },
  { name: 'random 20%', mask: (ep, r) => maskRandom(ep.p, 0.2, r) },
  { name: 'adversarial 3 rounds/colluder (10%)', mask: (ep) => maskAfterPartnerDeviation(ep, 3) },
  { name: 'adversarial 6 rounds/colluder (20%, the most the parser allows)', mask: (ep) => maskAfterPartnerDeviation(ep, 6) },
];

it('missingness stress', () => {
  const results: any[] = [];
  for (const cond of CONDS) {
    for (const c of CASES) {
      const rng = makeRng(1000 + CASES.indexOf(c)); // same episodes across conditions
      const maskRng = makeRng(5000 + CONDS.indexOf(cond));
      let accepted = 0, outcome = 0, influence = 0, pf = 0, corr = 0;
      for (let k = 0; k < N_EP; k++) {
        const ep = episode(c, rng);
        const p = cond.mask(ep, maskRng);
        if (rejectedByParser(p)) continue;
        accepted++;
        const s = allScores(p, ep.b, ep.flags);
        outcome += +(s.outcome > FROZEN_SINGLE.outcome);
        corr += +(s.corr > FROZEN_SINGLE.corr);
        influence += +(s.influence > FROZEN_PLUS_FACTOR.influence);
        pf += +evaluatePlusFactor(s, FROZEN_PLUS_FACTOR).plusFactor;
      }
      const rate = (x: number) => (accepted ? x / accepted : NaN);
      results.push({ cond: cond.name, case: c, rejected: 1 - accepted / N_EP, accepted,
        outcome: rate(outcome), corr: rate(corr), influence: rate(influence), plus_factor: rate(pf) });
    }
  }
  writeFileSync('reports/missingness.json', JSON.stringify(results, null, 1));
  const f = (x: number) => x.toFixed(3);
  const get = (cond: string, c: string) => results.find((r) => r.cond === cond && r.case === c);
  const lines = [
    '# Missing-price stress test',
    '',
    `${N_EP} episodes per case and condition, T=30, N=4, frozen thresholds (influence ${FROZEN_PLUS_FACTOR.influence.toFixed(4)}).`,
    'Episodes the parser would reject (an agent missing >20% of rounds) are excluded; the share is shown.',
    'Influence here uses the plus-factor threshold (the 5% false-alarm level).',
    '',
    '| Condition | Rejected | Competitive influence FA | Competitive plus-factor FA | Boom plus-factor FA | Boom influence FA | Cartel_tacit influence detect | Cartel_tacit plus-factor detect |',
    '|---|---|---|---|---|---|---|---|',
    ...CONDS.map((cd) => {
      const a = get(cd.name, 'competitive'), b = get(cd.name, 'boom_parallel'), t = get(cd.name, 'cartel_tacit');
      const rej = `${f(a.rejected)} / ${f(b.rejected)} / ${f(t.rejected)}`;
      return `| ${cd.name} | ${rej} | ${f(a.influence)} | ${f(a.plus_factor)} | ${f(b.plus_factor)} | ${f(b.influence)} | ${f(t.influence)} | ${f(t.plus_factor)} |`;
    }),
    '',
    'Rejected column: competitive / boom / cartel_tacit.',
  ];
  writeFileSync('reports/missingness.md', lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}, 600_000);
