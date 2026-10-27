import { useCallback, useEffect, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PlaygroundWorker from '../worker?worker';
import type { WorkerRequest, WorkerResponse } from '../worker';
import { CASES, CASE_NAMES, type CaseName } from '../core/sim';
import type { PlaygroundParams, PlaygroundResult } from '../core/playground';
import { paperFinding } from './paperFindings';

type Talk = PlaygroundParams['talk'];

const PRESET_HELP: Record<CaseName, string> = {
  competitive: 'Nobody colludes. Prices follow the market.',
  boom_parallel: 'Nobody colludes, but demand is high, so all prices rise together.',
  talk_no_action: 'Two sellers talk about colluding but price normally.',
  cartel_talk: 'Two sellers hold a high price, follow each other, and talk.',
  cartel_tacit: 'Same, with no collusive talk.',
  cartel_monitored: 'Same, with talk cleaned up because someone is watching.',
  cartel_static: 'Two sellers hold a high price and never react to each other.',
};

function defaults(preset: CaseName): Omit<PlaygroundParams, 'seed' | 'episodes'> {
  const talk: Talk = preset === 'cartel_talk' || preset === 'talk_no_action' ? 'collusive' : 'benign';
  return {
    preset,
    mu: 0.35,
    gamma: preset === 'cartel_static' ? 0 : 0.7,
    eps: 0,
    jitter: 0,
    boomShift: preset === 'boom_parallel' ? 0.3 : 0,
    T: 30,
    N: 4,
    talk,
  };
}

const SLIDERS: { key: 'mu' | 'gamma' | 'eps' | 'jitter' | 'boomShift' | 'T' | 'N'; label: string; hint: string; min: number; max: number; step: number }[] = [
  { key: 'mu', label: 'Markup', hint: 'How far above the fair price the cartel pair sets its price.', min: 0, max: 0.5, step: 0.01 },
  { key: 'gamma', label: 'Reaction', hint: "How strongly the pair follows each other's last price. 0 = never reacts.", min: 0, max: 0.95, step: 0.05 },
  { key: 'eps', label: 'Mask rate', hint: 'Share of rounds the pair prices normally to hide. Costs them profit.', min: 0, max: 0.8, step: 0.05 },
  { key: 'jitter', label: 'Jitter', hint: 'Random noise the pair adds to hide the pattern.', min: 0, max: 0.2, step: 0.01 },
  { key: 'boomShift', label: 'Demand boom', hint: 'Raises the fair price for everyone.', min: 0, max: 0.4, step: 0.01 },
  { key: 'T', label: 'Rounds', hint: 'How many rounds of prices the auditor sees.', min: 10, max: 120, step: 1 },
  { key: 'N', label: 'Sellers', hint: 'Number of sellers.', min: 2, max: 8, step: 1 },
];

const DETECTORS = [
  { key: 'outcome', name: 'Price level', ask: 'Is the price above fair?' },
  { key: 'talk', name: 'Talk', ask: 'Do messages look like coordination?' },
  { key: 'corr', name: 'Correlation', ask: 'Do prices move together?' },
  { key: 'influence', name: 'Influence', ask: "Does my price follow my rival's?" },
  { key: 'plus_factor', name: 'Plus-factor rule', ask: 'Price high AND (talk OR influence)' },
] as const;

const COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#b45309', '#475569', '#be185d', '#4d7c0f', '#0369a1'];

function isDefault(p: PlaygroundParams): boolean {
  const d = defaults(p.preset);
  return (Object.keys(d) as (keyof typeof d)[]).every((k) => d[k] === p[k]);
}

export function Playground() {
  const [params, setParams] = useState<PlaygroundParams>({ ...defaults('cartel_static'), seed: 20260101, episodes: 200 });
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const w = new PlaygroundWorker();
    worker.current = w;
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== reqId.current) return;
      setBusy(false);
      if (e.data.error) setError(e.data.error);
      else setResult(e.data.result!);
    };
    return () => w.terminate();
  }, []);

  const run = useCallback((p: PlaygroundParams) => {
    reqId.current += 1;
    setBusy(true);
    setError('');
    worker.current?.postMessage({ id: reqId.current, params: p } satisfies WorkerRequest);
  }, []);

  useEffect(() => { run(params); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof PlaygroundParams>(k: K, v: PlaygroundParams[K]) => setParams((p) => ({ ...p, [k]: v }));
  const choose = (c: CaseName) => {
    const next = { ...params, ...defaults(c) };
    setParams(next);
    run(next);
  };
  const newSeed = () => {
    const next = { ...params, seed: Math.floor(Math.random() * 1e9) };
    setParams(next);
    run(next);
  };

  const stale = result !== null && JSON.stringify(result.params) !== JSON.stringify(params);

  return (
    <section aria-labelledby="pg-title">
      <h2 id="pg-title">Detector Playground</h2>
      <p>
        Pick a market. Each run simulates {params.episodes} markets and shows how often each check raises a flag. For innocent
        markets, lower is better. For cartels, higher is better. A red bar is a wrong call.
      </p>

      <div className="presets" role="group" aria-label="Market type">
        {CASE_NAMES.map((c) => (
          <button key={c} className={`chip ${params.preset === c ? 'on' : ''}`} aria-pressed={params.preset === c} onClick={() => choose(c)}>
            <span className="chip-name">{c.replace(/_/g, ' ')}</span>
            <span className="chip-tag">{CASES[c].label ? 'cartel' : 'innocent'}</span>
          </button>
        ))}
      </div>
      <p className="muted">{PRESET_HELP[params.preset]}</p>

      <div className="panel">
        <div className="sliders">
          {SLIDERS.map((s) => (
            <label key={s.key} className="slider">
              <span className="slider-top">
                <span>{s.label}</span>
                <output>{params[s.key]}</output>
              </span>
              <input type="range" min={s.min} max={s.max} step={s.step} value={params[s.key]} onChange={(e) => set(s.key, Number(e.target.value))} aria-describedby={`h-${s.key}`} />
              <span id={`h-${s.key}`} className="hint">{s.hint}</span>
            </label>
          ))}
          <label className="slider">
            <span className="slider-top"><span>Talk</span></span>
            <select value={params.talk} onChange={(e) => set('talk', e.target.value as Talk)}>
              <option value="none">No monitor (talk check off)</option>
              <option value="benign">Monitor sees normal chatter</option>
              <option value="collusive">Pair talks about colluding</option>
            </select>
            <span className="hint">What the message monitor sees.</span>
          </label>
        </div>
        <p className="hint">Markup, reaction, mask and jitter only change the two cartel sellers. They do nothing in innocent markets.</p>
        <div className="actions">
          <button className="primary" onClick={() => run(params)} disabled={busy}>{busy ? 'Running…' : 'Run'}</button>
          <button onClick={newSeed} disabled={busy}>New seed</button>
          <span className="muted">Seed {params.seed}</span>
        </div>
      </div>

      {error && <p role="alert" className="err">Something went wrong: {error}</p>}
      {stale && !busy && <p className="note" role="status">Settings changed. Press Run to update the results.</p>}

      {result && (
        <Results result={result} innocent={CASES[result.params.preset].label === 0} faded={stale} />
      )}
    </section>
  );
}

function Results({ result, innocent, faded }: { result: PlaygroundResult; innocent: boolean; faded: boolean }) {
  const p = result.params;
  const finding = isDefault(p) ? paperFinding(p.preset) : null;
  const th = result.thresholds;
  const data = result.example.p.map((row, t) => {
    const o: Record<string, number> = { round: t + 1, benchmark: result.example.b[t] };
    row.forEach((v, i) => { o[`Seller ${i + 1}`] = v; });
    return o;
  });
  const [a, b] = result.example.pair;
  const [pa, pb] = result.example.predPair;
  const cartel = !innocent;

  return (
    <div className={faded ? 'faded' : ''}>
      <h3>How often each check raises a flag</h3>
      <ul className="bars" aria-label="Flag rate per check">
        {DETECTORS.map((d) => {
          const v = result.rates[d.key];
          const unavailable = v === null;
          const wrong = !unavailable && (innocent ? v > 0.5 : v < 0.5);
          return (
            <li key={d.key} className={wrong ? 'wrong' : ''}>
              <div className="bar-head">
                <strong>{d.name}</strong>
                <span>{unavailable ? 'not available (no monitor)' : `${Math.round(v * 100)}%${wrong ? ' · wrong call' : ''}`}</span>
              </div>
              <div className="track" role="img" aria-label={`${d.name}: ${unavailable ? 'not available' : Math.round(v * 100) + ' percent'}`}>
                <div className="fill" style={{ width: `${unavailable ? 0 : v * 100}%` }} />
              </div>
              <div className="hint">{d.ask}</div>
            </li>
          );
        })}
      </ul>
      <p className="hint">
        {th.frozen
          ? 'Thresholds: set once on 4 sellers, 30 rounds (the paper).'
          : `Thresholds for talk, influence and the plus-factor rule were recalibrated on ${th.calibrationEpisodes} simulated innocent markets with ${p.T} rounds and ${p.N} sellers. Price level and correlation keep the paper's thresholds.`}
      </p>

      {finding && (
        <div className="paper">
          <strong>What the paper found</strong>
          <p>{finding.text}</p>
          {finding.note && <p>{finding.note}</p>}
          <p className="hint">Your run uses a new random draw, so numbers differ by a few points.</p>
        </div>
      )}
      {!finding && <p className="hint">The paper's numbers are for the default settings of each market type (30 rounds, 4 sellers).</p>}

      {cartel && (
        <div className="tradeoff">
          <strong>Hiding costs profit</strong>
          <p>
            The pair keeps <b>{Math.round(result.markupKept * 100)}%</b> of the cartel markup. The influence check flags <b>{Math.round(result.rates.influence * 100)}%</b> of these markets, and names the right pair in <b>{Math.round(result.pairFound * 100)}%</b>.
          </p>
          <p className="hint">Try raising Mask rate or Jitter. Watch the markup kept fall faster than detection.</p>
        </div>
      )}

      <h3>One example market</h3>
      <p className="hint">
        {cartel ? `True pair: Sellers ${a + 1} and ${b + 1}. ` : ''}Influence check names Sellers {pa + 1} and {pb + 1}
        {cartel ? (pa === a && pb === b ? ' (correct).' : ' (wrong pair).') : ' (there is no cartel here).'}
      </p>
      <div className="chart" role="img" aria-label={`Prices by round for ${p.N} sellers, with the fair price as a dashed line`}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
            <YAxis domain={[0, 1]} label={{ value: 'Price', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line dataKey="benchmark" name="Fair price" stroke="currentColor" strokeDasharray="6 4" dot={false} strokeWidth={2} isAnimationActive={false} />
            {Array.from({ length: p.N }, (_, i) => {
              const trueMember = cartel && (i === a || i === b);
              return <Line key={i} dataKey={`Seller ${i + 1}`} stroke={COLORS[i]} dot={false} strokeWidth={trueMember ? 3 : 1.5} strokeOpacity={cartel && !trueMember ? 0.55 : 1} isAnimationActive={false} />;
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
