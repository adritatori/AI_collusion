// SPEC 9.6: one test per validation rule in 5.2, on small hand-made CSVs.
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/core/parse';
import { corrScore, influenceScore } from '../src/core/detectors';

/** Long CSV with T rounds and N agents; price(t, i) gives each cell (null = empty cell). */
function csv(T: number, N: number, price: (t: number, i: number) => number | string | null, extra = ''): string {
  const lines = [`round,agent,price${extra ? ',' + extra : ''}`];
  for (let t = 1; t <= T; t++)
    for (let i = 1; i <= N; i++) {
      const v = price(t, i);
      lines.push(`${t},a${i},${v ?? ''}`);
    }
  return lines.join('\n');
}
const noisy = (t: number, i: number) => (0.3 + 0.05 * Math.sin(t * 1.7 + i * 2.3)).toFixed(4);

describe('parser validation', () => {
  it('accepts a clean log', () => {
    const r = parseCsv(csv(25, 3, noisy));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.log!.agents).toEqual(['a1', 'a2', 'a3']);
    expect(r.log!.p.length).toBe(25);
  });

  it('sorts unsorted rows by round, then agent', () => {
    const text = 'round,agent,price\n2,b,0.4\n1,b,0.2\n2,a,0.3\n1,a,0.1';
    const r = parseCsv(text);
    expect(r.log!.agents).toEqual(['a', 'b']);
    expect(r.log!.p).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  it('orders agents naturally (agent_2 before agent_10)', () => {
    const r = parseCsv('round,agent,price\n1,agent_10,0.1\n1,agent_2,0.2\n2,agent_10,0.3\n2,agent_2,0.4');
    expect(r.log!.agents).toEqual(['agent_2', 'agent_10']);
  });

  it('keeps the first duplicate and warns with a count', () => {
    const text = 'round,agent,price\n1,a,0.1\n1,a,0.9\n1,b,0.2\n2,a,0.3\n2,b,0.4\n2,b,0.8';
    const r = parseCsv(text);
    expect(r.log!.p).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(r.warnings.some((w) => w.startsWith('2 duplicate'))).toBe(true);
  });

  it('treats a missing price as NaN and warns', () => {
    const r = parseCsv(csv(25, 3, (t, i) => (t === 5 && i === 2 ? null : noisy(t, i))));
    expect(r.errors).toEqual([]);
    expect(Number.isNaN(r.log!.p[4][1])).toBe(true);
    expect(r.warnings.some((w) => w.startsWith('1 price(s) missing'))).toBe(true);
  });

  it('treats a missing (round, agent) row as missing', () => {
    const text = csv(25, 3, noisy).split('\n').filter((l) => l !== `7,a3,${noisy(7, 3)}`).join('\n');
    const r = parseCsv(text);
    expect(Number.isNaN(r.log!.p[6][2])).toBe(true);
    expect(r.warnings.some((w) => w.includes('missing'))).toBe(true);
  });

  it('errors in pairwise mode if an agent misses more than 20% of rounds, but not in auction mode', () => {
    const text = csv(20, 3, (t, i) => (i === 1 && t <= 5 ? null : noisy(t, i))); // 25% missing
    const pw = parseCsv(text, 'pairwise');
    expect(pw.log).toBeNull();
    expect(pw.errors[0]).toMatch(/a1.*more than 20%/);
    const rm = parseCsv(text, 'restOfMarket');
    expect(rm.errors).toEqual([]);
    expect(rm.log).not.toBeNull();
  });

  it('allows exactly 20% missing in pairwise mode', () => {
    const r = parseCsv(csv(20, 3, (t, i) => (i === 1 && t <= 4 ? null : noisy(t, i))));
    expect(r.errors).toEqual([]);
  });

  it('errors on a non-numeric price, naming the row', () => {
    const r = parseCsv(csv(25, 3, (t, i) => (t === 2 && i === 1 ? 'abc' : noisy(t, i))));
    expect(r.log).toBeNull();
    expect(r.errors).toEqual(['Row 5: price "abc" is not a number.']);
  });

  it('errors on a negative price, naming the row', () => {
    const r = parseCsv(csv(25, 3, (t, i) => (t === 1 && i === 3 ? '-0.2' : noisy(t, i))));
    expect(r.errors).toEqual(['Row 4: price -0.2 is negative.']);
  });

  it('errors on flagged outside {0,1}, naming the row', () => {
    const text = 'round,agent,price,flagged\n1,a,0.1,0\n1,b,0.2,2\n2,a,0.3,1\n2,b,0.4,0';
    const r = parseCsv(text);
    expect(r.errors).toEqual(['Row 3: flagged must be 0 or 1, got "2".']);
  });

  it('warns on different benchmark values within a round and uses the mean', () => {
    const text = 'round,agent,price,benchmark\n1,a,0.1,0.3\n1,b,0.2,0.5\n2,a,0.3,0.3\n2,b,0.4,0.3';
    const r = parseCsv(text);
    expect(r.log!.benchmark).toEqual([0.4, 0.3]);
    expect(r.warnings.some((w) => w.startsWith('1 round(s) have different benchmark'))).toBe(true);
  });

  it('errors with N = 1', () => {
    const r = parseCsv(csv(25, 1, noisy));
    expect(r.log).toBeNull();
    expect(r.errors[0]).toMatch(/at least 2/);
  });

  it('errors with N = 13', () => {
    const r = parseCsv(csv(25, 13, noisy));
    expect(r.log).toBeNull();
    expect(r.errors[0]).toMatch(/pairwise detectors are not meaningful at this size in v1/);
  });

  it('accepts N = 12', () => {
    expect(parseCsv(csv(25, 12, noisy)).errors).toEqual([]);
  });

  it('warns that influence is unreliable at T = 8', () => {
    const r = parseCsv(csv(8, 4, noisy));
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => /Influence is unreliable below 20 rounds/.test(w))).toBe(true);
  });

  it('does not warn at T = 20', () => {
    expect(parseCsv(csv(20, 4, noisy)).warnings).toEqual([]);
  });

  it('reports no price variation for constant prices; corr = -1, influence = 0', () => {
    const r = parseCsv(csv(25, 3, () => '0.5'));
    expect(r.log!.constant).toBe(true);
    expect(r.warnings).toContain('No price variation: every price is the same.');
    expect(corrScore(r.log!.p)).toBe(-1);
    expect(influenceScore(r.log!.p, null).score).toBe(0);
  });

  it('allows prices outside [0,1] with no benchmark and marks them', () => {
    const r = parseCsv(csv(25, 3, (t, i) => (90 + Number(noisy(t, i)) * 10).toFixed(2)));
    expect(r.errors).toEqual([]);
    expect(r.log!.outsideUnit).toBe(true);
    expect(r.log!.benchmark).toBeNull();
  });

  it('errors on missing required columns', () => {
    expect(parseCsv('round,agent\n1,a').errors[0]).toMatch(/Missing required column\(s\): price/);
  });

  it('reads messages with quoted commas and newlines', () => {
    const text = 'round,agent,price,message\n1,a,0.1,"hi, there"\n1,b,0.2,"two\nlines"\n2,a,0.3,\n2,b,0.4,ok';
    const r = parseCsv(text);
    expect(r.errors).toEqual([]);
    expect(r.log!.messages).toEqual([['hi, there', 'two\nlines'], ['', 'ok']]);
  });

  it('parses all sample CSVs without errors', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../samples/', import.meta.url);
    for (const f of readdirSync(dir)) {
      const r = parseCsv(readFileSync(new URL(f, dir), 'utf8'), f.startsWith('real') ? 'restOfMarket' : 'pairwise');
      expect(r.errors, f).toEqual([]);
    }
  });
});
