import { useEffect, useMemo, useState } from 'react';
import { CASES } from '../core/sim';
import type { Calibration } from '../core/calibrate';
import { FROZEN_SINGLE, type Thresholds } from '../core/detectors';
import { benchToCsv, DEFAULT_BENCH, makeBench, ourFlags, parseFlagsCsv, scorecard, toInput, type BenchSettings, type Scorecard } from '../core/ownMethod';
import { EXAMPLE_DETECTOR, runInSandbox } from '../core/sandbox';
import { download, pct } from './util';
import { useWorker } from './useWorker';

const NAMES: Record<string, string> = { outcome: 'Price level', talk: 'Talk', corr: 'Correlation', influence: 'Influence', plus_factor: 'Plus-factor rule', yours: 'Your method' };

export function TestMethod() {
  const [s, setS] = useState<BenchSettings>(DEFAULT_BENCH);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [yours, setYours] = useState<number[] | null>(null);
  const [src, setSrc] = useState('');
  const [code, setCode] = useState(EXAMPLE_DETECTOR);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = useWorker();

  const markets = useMemo(() => makeBench(s), [s]);
  useEffect(() => { setYours(null); setSrc(''); setMsg(null); }, [s]);
  useEffect(() => {
    let live = true;
    setCal(null);
    worker.call<'calibrate'>({ kind: 'calibrate', T: s.T, N: s.N, withBenchmark: true, seed: s.seed + 1 }).then((r) => live && setCal(r.result)).catch(() => undefined);
    return () => { live = false; };
  }, [s.T, s.N, s.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const card: Scorecard | null = useMemo(() => {
    if (!cal) return null;
    const single: Required<Thresholds> = cal.frozen ? FROZEN_SINGLE : { ...FROZEN_SINGLE, influence: cal.thresholds.influence, talk: cal.thresholds.talk };
    const flags: Record<string, number[]> = { ...ourFlags(markets, single, cal.thresholds) };
    if (yours) flags.yours = yours;
    return scorecard(markets, flags);
  }, [markets, cal, yours]);

  const set = (k: keyof BenchSettings, v: number) => setS((p) => ({ ...p, [k]: v }));

  async function onFlagsFile(f: File | undefined) {
    if (!f) return;
    const r = parseFlagsCsv(await f.text(), markets);
    if (r.errors.length) { setMsg({ kind: 'err', text: r.errors }); return; }
    setYours(markets.map((m) => r.flags.get(m.id) as number));
    setSrc(`file ${f.name}`);
    setMsg({ kind: 'ok', text: ['Read your flags.', ...r.warnings] });
  }
  async function runCode() {
    setBusy(true);
    setMsg(null);
    const r = await runInSandbox(code, markets.map(toInput));
    setBusy(false);
    if ('error' in r) { setMsg({ kind: 'err', text: [r.error] }); return; }
    setYours(r.flags);
    setSrc('pasted function');
    setMsg({ kind: 'ok', text: ['Your function ran on every market.'] });
  }

  const cols = card ? Object.keys(card.summary) : [];
  return (
    <section aria-labelledby="tm-title">
      <h2 id="tm-title">Test your own detector</h2>
      <p>
        Real logs have no answer key: nobody can say for sure which markets were collusive. These simulated markets do. Each one is
        labelled, so you can measure how often your method raises a false alarm and what it misses, next to the paper's four checks and
        the plus-factor rule.
      </p>

      <h3>1. Choose the test markets</h3>
      <div className="panel">
        <div className="sliders">
          <Num label="Markets per type" v={s.perCase} min={10} max={100} step={10} on={(v) => set('perCase', v)} />
          <Num label="Rounds" v={s.T} min={10} max={120} step={1} on={(v) => set('T', v)} />
          <Num label="Sellers" v={s.N} min={2} max={8} step={1} on={(v) => set('N', v)} />
          <Num label="Seed" v={s.seed} min={1} max={999999999} step={1} on={(v) => set('seed', v)} />
        </div>
        <p className="hint">{markets.length} markets: {7} types × {s.perCase}. The same settings always give the same markets.</p>
        <button onClick={() => download(`benchmark_seed${s.seed}_T${s.T}_N${s.N}_x${s.perCase}.csv`, benchToCsv(markets))}>Download the markets (CSV)</button>
        <p className="hint">Columns: market_id, case, label (1 = cartel), true_pair, round, agent, price, benchmark, flagged. Run your detector on each market_id in any language.</p>
      </div>

      <h3>2. Bring your results</h3>
      <div className="two">
        <div className="panel">
          <b>A. Upload your flags</b>
          <p className="hint">A CSV with two columns, <code>market_id</code> and <code>flag</code> (1 = your method flags that market). One row per market.</p>
          <input type="file" accept=".csv,text/csv" aria-label="Upload your flags CSV" onChange={(e) => void onFlagsFile(e.target.files?.[0])} />
        </div>
        <div className="panel">
          <b>B. Paste a JavaScript function</b>
          <p className="hint">It runs here, in your browser, once per market. It gets <code>{'{ prices, benchmark, flags, rounds, sellers }'}</code> and must return true or false. Network access is switched off. Only run code you wrote or trust.</p>
          <textarea className="code" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} aria-label="Detector function" rows={9} />
          <div className="actions">
            <button className="primary" onClick={() => void runCode()} disabled={busy}>{busy ? 'Running…' : 'Run on all markets'}</button>
          </div>
        </div>
      </div>
      {msg && (
        <div role={msg.kind === 'err' ? 'alert' : 'status'} className={msg.kind === 'err' ? 'err' : 'note'}>
          <ul>{msg.text.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}

      <h3>3. How often each method raises a flag</h3>
      {!card && <p className="note" role="status">Calibrating for {s.T} rounds and {s.N} sellers…</p>}
      {card && (
        <>
          <p className="hint">
            Innocent types should be near 0%; cartel types near 100%. Red marks a wrong call (more than half wrong).
            {cal && !cal.frozen ? ` Talk, influence and the plus-factor rule use thresholds recalibrated for ${s.T} rounds and ${s.N} sellers.` : ' Thresholds from the paper (4 sellers, 30 rounds).'}
            {yours ? ` Your method: ${src}.` : ''}
          </p>
          <div className="scroll">
            <table className="grid">
              <caption className="sr">Flag rate by market type and method</caption>
              <thead>
                <tr><th scope="col">Market type</th>{cols.map((c) => <th scope="col" key={c} className={c === 'yours' ? 'mine' : ''}>{NAMES[c]}</th>)}</tr>
              </thead>
              <tbody>
                {card.rows.map((r) => (
                  <tr key={r.case}>
                    <th scope="row">{r.case.replace(/_/g, ' ')}<span className="chip-tag">{CASES[r.case].label ? 'cartel' : 'innocent'}</span></th>
                    {cols.map((c) => {
                      const v = r.rates[c];
                      const wrong = r.label === 0 ? v > 0.5 : v < 0.5;
                      return <td key={c} className={`${wrong ? 'bad' : ''} ${c === 'yours' ? 'mine' : ''}`}>{pct(v)}{wrong ? ' ✗' : ''}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Summary</h3>
          <div className="scroll">
            <table className="grid">
              <thead><tr><th scope="col">Method</th><th scope="col">Caught (avg over cartel types)</th><th scope="col">False alarms (avg over innocent types)</th><th scope="col">Worst miss</th><th scope="col">Worst false alarm</th></tr></thead>
              <tbody>
                {cols.map((c) => {
                  const m = card.summary[c];
                  return (
                    <tr key={c} className={c === 'yours' ? 'mine' : ''}>
                      <th scope="row">{NAMES[c]}</th>
                      <td>{pct(m.tpr)}</td>
                      <td>{pct(m.fpr)}</td>
                      <td>{m.worstMiss.case.replace(/_/g, ' ')} ({pct(m.worstMiss.rate)})</td>
                      <td>{m.worstFalseAlarm.case.replace(/_/g, ' ')} ({pct(m.worstFalseAlarm.rate)})</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!yours && <p className="hint">Add your own results above to see them in the table. The other columns are the paper's checks on the same markets.</p>}
          <p className="hint">These are scripted markets. Passing here does not show a method works on real logs. It shows where it fails when the answer is known.</p>
        </>
      )}
    </section>
  );
}

function Num({ label, v, min, max, step, on }: { label: string; v: number; min: number; max: number; step: number; on: (v: number) => void }) {
  const [draft, setDraft] = useState(String(v));
  useEffect(() => setDraft(String(v)), [v]);
  const commit = () => {
    const x = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(x)) on(Math.min(max, Math.max(min, Math.round(x))));
    else setDraft(String(v));
  };
  return (
    <label className="slider">
      <span className="slider-top"><span>{label}</span><span className="hint">{min} to {max}</span></span>
      <input type="number" min={min} max={max} step={step} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </label>
  );
}
