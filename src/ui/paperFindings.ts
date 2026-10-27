// "What the paper found": numbers copied straight from data/exp1.json, nothing invented.
import exp1 from '../../data/exp1.json';
import type { CaseName } from '../core/sim';

type Row = { outcome: number; talk: number; corr: number; influence: number; plus_factor: number };
const rows = exp1.per_case_flag_rate as Record<string, Row>;
const pct = (x: number) => `${Math.round(x * 100)}%`;

const NOTE: Partial<Record<CaseName, string>> = {
  boom_parallel: 'Innocent, but prices rise with demand. The price check flags it every time. The plus-factor rule cuts that.',
  talk_no_action: 'Innocent: they talk but do not act. The talk check flags it every time. The plus-factor rule does not.',
  cartel_static: 'The blind spot. The pair holds a high price and never reacts, so nothing supports the price signal.',
  competitive: 'Innocent baseline. The talk and correlation checks flag it anyway.',
};

export function paperFinding(c: CaseName): { text: string; note?: string } {
  const r = rows[c];
  return {
    text: `Paper, 200 test markets, 30 rounds, 4 agents: price ${pct(r.outcome)}, talk ${pct(r.talk)}, correlation ${pct(r.corr)}, influence ${pct(r.influence)}, plus-factor ${pct(r.plus_factor)}.`,
    note: NOTE[c],
  };
}
