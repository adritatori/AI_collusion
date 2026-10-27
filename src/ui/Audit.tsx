import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { defaultCompetitive, judge, scoreLog, type Judgement, type Scores } from '../core/audit';
import type { Calibration } from '../core/calibrate';
import { FROZEN_SINGLE, PROFILE_TEXT, type Profile } from '../core/detectors';
import { listAgents, MAX_AGENTS, parseCsv, type AgentSummary, type Mode, type ParsedLog } from '../core/parse';
import { messageLengthByRound } from '../core/realInfluence';
import { copyText, fmt } from './util';
import { SAMPLES, type Sample } from './samples';
import { useWorker } from './useWorker';

const COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#b45309', '#475569', '#be185d', '#4d7c0f', '#0369a1', '#dc2626', '#0f766e', '#6d28d9', '#a16207'];

const NEXT_STEPS: Record<Profile, string[]> = {
  HARM_WITH_PLUS_FACTOR: ['Keep the full logs, including messages.', 'Treat this as a lead for a closer look, not a conclusion.'],
  HARM_WITHOUT_PLUS_FACTOR: [
    'Check the true competitive price. Did costs or demand change?',
    'Swap one agent for a fresh one and see if prices drop.',
    'Cut the message channel before any talk starts and compare.',
  ],
  PLUS_FACTOR_WITHOUT_HARM: ['Prices look normal. Keep watching if talk or reaction continues.'],
  NO_EVIDENCE: ['A longer log, or a log from a different period, can help.'],
};

interface Loaded { name: string; text: string }

export function Audit() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mode, setMode] = useState<Mode>('pairwise');
  const [competitive, setCompetitive] = useState('');
  const [monopoly, setMonopoly] = useState('');
  const [picked, setPicked] = useState<string[] | null>(null);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [calBusy, setCalBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const worker = useWorker();

  const agents: AgentSummary[] = useMemo(() => (loaded ? listAgents(loaded.text) : []), [loaded]);
  const tooMany = agents.length > MAX_AGENTS;
  const parsed = useMemo(() => {
    if (!loaded) return null;
    if (tooMany && !picked) return null;
    return parseCsv(loaded.text, mode, tooMany ? { onlyAgents: picked ?? [] } : {});
  }, [loaded, mode, tooMany, picked]);
  const log: ParsedLog | null = parsed?.log ?? null;

  // Prefill the competitive price from the log's own benchmark when it has one.
  useEffect(() => {
    if (!log) return;
    const d = defaultCompetitive(log);
    if (d !== null && competitive === '') setCompetitive(String(Number(d.toFixed(4))));
  }, [log]); // eslint-disable-line react-hooks/exhaustive-deps

  const comp = competitive.trim() === '' ? null : Number(competitive);
  const mono = monopoly.trim() === '' ? null : Number(monopoly);
  const settingsOk = comp !== null && Number.isFinite(comp) && (mono === null || Number.isFinite(mono));

  const scores: Scores | null = useMemo(
    () => (log && settingsOk ? scoreLog(log, { mode, competitive: comp as number, monopoly: mono }) : null),
    [log, mode, comp, mono, settingsOk],
  );

  // Thresholds depend on the log's length, size and whether it has a benchmark column.
  const T = log?.p.length ?? 0;
  const N = log?.agents.length ?? 0;
  const hasBench = log?.benchmark != null;
  useEffect(() => {
    setCal(null);
    // Auction logs without a flagged column never use a calibrated threshold.
    if (!log || (mode === 'restOfMarket' && !log.flags)) return;
    let live = true;
    setCalBusy(true);
    worker.call<'calibrate'>({ kind: 'calibrate', T, N, withBenchmark: hasBench, seed: 20260101 })
      .then((r) => { if (live) { setCal(r.result); setCalBusy(false); } })
      .catch(() => live && setCalBusy(false));
    return () => { live = false; };
  }, [log, mode, T, N, hasBench]); // eslint-disable-line react-hooks/exhaustive-deps

  const noCalNeeded = mode === 'restOfMarket' && !log?.flags;
  const judgement: Judgement | null = scores && cal ? judge(scores, cal.thresholds) : scores && noCalNeeded ? judge(scores, { outcome: 0, talk: Infinity, influence: Infinity }) : null;

  function load(name: string, text: string, s?: Sample) {
    setLoaded({ name, text });
    setPicked(null);
    setCompetitive(s?.competitive !== undefined ? String(s.competitive) : '');
    setMonopoly(s?.monopoly !== undefined ? String(s.monopoly) : '');
    setCal(null);
    if (s) setMode(s.mode);
    else {
      const head = text.slice(0, 400).toLowerCase();
      setMode(head.includes('bid') && !head.includes('benchmark') ? 'restOfMarket' : 'pairwise');
    }
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    load(f.name, await f.text());
  }

  const exportJson = () => {
    if (!scores || !judgement) return '';
    const { influenceMatrix, ...rest } = scores;
    return JSON.stringify({ file: loaded?.name, settings: { mode, competitive: comp, monopoly: mono }, scores: { ...rest, influenceMatrix }, thresholds: cal?.thresholds ?? null, calibration: cal ? { T: cal.T, N: cal.N, episodes: cal.episodes, frozen: cal.frozen } : null, profile: judgement.profile, warnings: parsed?.warnings }, null, 2);
  };

  return (
    <section aria-labelledby="au-title">
      <h2 id="au-title">Audit your price logs</h2>
      <p>
        Upload prices from AI sellers (or any sellers). You get a plain-language <b>evidence profile</b>: what kind of evidence is
        in the log, and what the checks cannot tell. It does not say whether anyone colluded. Your file stays in your browser.
      </p>

      <div
        className={`drop ${drag ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void onFile(e.dataTransfer.files[0]); }}
      >
        <p><b>Drop a CSV here</b>, or</p>
        <button className="primary" onClick={() => fileInput.current?.click()}>Choose a file</button>
        <input ref={fileInput} type="file" accept=".csv,text/csv,text/plain" hidden aria-label="Choose a CSV file" onChange={(e) => void onFile(e.target.files?.[0])} />
        <details className="format">
          <summary>What should the file look like?</summary>
          <p>One row per seller per round. Columns: <code>round</code>, <code>agent</code>, <code>price</code>.</p>
          <p>Optional: <code>benchmark</code> (the fair price that round), <code>flagged</code> (1 if your message monitor flagged that seller that round, else 0), <code>message</code>, <code>bid</code> (average buyer bid, for auction logs).</p>
          <p>A file with one column per seller also works. Dates or days can stand in for round numbers. 2 to {MAX_AGENTS} sellers; more than that, you choose which to keep.</p>
          <p><button onClick={() => import('./csvTemplate').then((m) => m.downloadTemplate())}>Download a template</button></p>
        </details>
      </div>

      <h3>Or try an example</h3>
      <div className="presets" role="group" aria-label="Examples">
        {SAMPLES.map((s) => (
          <button key={s.file} className={`chip ${loaded?.name === s.file ? 'on' : ''}`} onClick={() => load(s.file, s.text, s)} title={s.blurb}>
            <span className="chip-name">{s.label}</span>
            <span className="chip-tag">{s.blurb}</span>
          </button>
        ))}
      </div>

      {loaded && (
        <>
          <h3>Your file: {loaded.name}</h3>
          {tooMany && (
            <SellerPicker agents={agents} picked={picked} onPick={setPicked} />
          )}
          {parsed && parsed.errors.length > 0 && (
            <div role="alert" className="err">
              <b>We could not read this file.</b>
              <ul>{parsed.errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          {parsed && parsed.warnings.length > 0 && (
            <div className="note" role="status">
              <ul>{parsed.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}

          {log && (
            <div className="panel">
              <fieldset className="modes">
                <legend>Type of log</legend>
                <label><input type="radio" name="mode" checked={mode === 'pairwise'} onChange={() => setMode('pairwise')} /> Sellers set prices each round (checks every pair of sellers)</label>
                <label><input type="radio" name="mode" checked={mode === 'restOfMarket'} onChange={() => setMode('restOfMarket')} /> Auction log (tolerates gaps; checks each seller against the rest)</label>
              </fieldset>
              <div className="sliders">
                <label className="slider">
                  <span className="slider-top"><span>Competitive price</span></span>
                  <input type="number" inputMode="decimal" value={competitive} onChange={(e) => setCompetitive(e.target.value)} aria-describedby="h-comp" />
                  <span id="h-comp" className="hint">The price you would expect with real competition.{defaultCompetitive(log) !== null ? ' Filled in from your benchmark column. Change it if you know better.' : ''}</span>
                </label>
                <label className="slider">
                  <span className="slider-top"><span>Monopoly price (optional)</span></span>
                  <input type="number" inputMode="decimal" value={monopoly} onChange={(e) => setMonopoly(e.target.value)} aria-describedby="h-mono" />
                  <span id="h-mono" className="hint">The highest price a fully coordinated market would reach. Needed if prices are not between 0 and 1.</span>
                </label>
              </div>
            </div>
          )}

          {log && !settingsOk && <p className="note" role="status">Enter the competitive price to see results.</p>}
          {scores && scores.problems.length > 0 && <p className="note" role="status">{scores.problems.join(' ')}</p>}
          {scores && scores.problems.length === 0 && (
            <Results log={log!} scores={scores} judgement={judgement} cal={cal} calBusy={calBusy} mode={mode} onCopy={async () => setCopied((await copyText(exportJson())) ? 'Copied.' : 'Could not copy. Select the text instead.')} copied={copied} />
          )}
        </>
      )}
    </section>
  );
}

function SellerPicker({ agents, picked, onPick }: { agents: AgentSummary[]; picked: string[] | null; onPick: (a: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(() => agents.slice(0, MAX_AGENTS).map((a) => a.agent));
  const toggle = (a: string) => setSel((s) => (s.includes(a) ? s.filter((x) => x !== a) : s.length < MAX_AGENTS ? [...s, a] : s));
  return (
    <div className="panel">
      <b>This file has {agents.length} sellers. Choose up to {MAX_AGENTS}.</b>
      <p className="hint">The checks look at pairs of sellers and are not meaningful at larger sizes. The most complete sellers are ticked.</p>
      <div className="pickgrid">
        {agents.map((a) => (
          <label key={a.agent}>
            <input type="checkbox" checked={sel.includes(a.agent)} onChange={() => toggle(a.agent)} /> {a.agent} <span className="hint">({a.priced} prices)</span>
          </label>
        ))}
      </div>
      <button className="primary" disabled={sel.length < 2} onClick={() => onPick(sel)}>{picked ? 'Update' : 'Use these'} ({sel.length})</button>
    </div>
  );
}

function Results({ log, scores, judgement, cal, calBusy, mode, onCopy, copied }: {
  log: ParsedLog; scores: Scores; judgement: Judgement | null; cal: Calibration | null; calBusy: boolean; mode: Mode; onCopy: () => void; copied: string;
}) {
  const th = cal?.thresholds;
  const blind = judgement?.profile === 'HARM_WITHOUT_PLUS_FACTOR';
  const text = judgement ? PROFILE_TEXT[judgement.profile] : null;
  const data = log.p.map((row, t) => {
    const o: Record<string, number | null> = { round: log.rounds[t] };
    row.forEach((v, i) => { o[log.agents[i]] = Number.isFinite(v) ? v : null; });
    if (log.benchmark) o['Fair price'] = log.benchmark[t];
    return o;
  });
  const [a, b] = scores.accused ?? [-1, -1];
  const inRule = (x: boolean) => (x ? 'Signal present' : 'Not present');
  const talkTile = scores.talk === null ? 'Not available (no flagged column)' : th ? `${fmt(scores.talk)} vs ${fmt(th.talk)}` : fmt(scores.talk);

  return (
    <>
      {calBusy && <p className="note" role="status">Calibrating thresholds for {scores.T} rounds and {scores.N} sellers…</p>}
      {text && judgement && (
        <div className={`profile ${blind ? 'amber' : ''}`} role="region" aria-label="Evidence profile">
          <p className="kicker">{blind ? 'Cannot decide from these logs' : 'Evidence profile'}</p>
          <h3>{text.headline}</h3>
          <p>{text.body}</p>
          <ul>{NEXT_STEPS[judgement.profile].map((s) => <li key={s}>{s}</li>)}</ul>
          {scores.collusionIndex !== null && (
            <p><b>Collusion index {fmt(scores.collusionIndex, 2)}.</b> Average price over the last 10 rounds, as a share of the way from the competitive price (0) to the monopoly price (1).</p>
          )}
        </div>
      )}
      {judgement && mode === 'restOfMarket' && (
        <p className="hint">Auction mode: the influence number has no calibrated threshold, so it is shown but left out of the rule. The rule uses price and, if present, talk.</p>
      )}
      {cal && (
        <p className="hint" title="Calibration is only as good as the simulated innocent-market model, which is a simple scripted market.">
          {cal.frozen
            ? 'Thresholds from the paper: 4 sellers, 30 rounds.'
            : `Thresholds for talk and influence calibrated on ${cal.episodes} simulated innocent markets with T=${cal.T} rounds, N=${cal.N} sellers${scores.hasBenchmark ? '' : ', without a benchmark'}.`} Hover for the limits.
        </p>
      )}

      <h3>The four checks</h3>
      <div className="tiles">
        <Tile name="Price level" value={`${fmt(scores.harm)} vs ${fmt(scores.harmThreshold)}`} unit={scores.harmUnit === 'share' ? 'share of the way to the monopoly price' : 'price units above competitive'}
          on={judgement?.harm} means="Is the price above the competitive level?" fails="Fooled by a demand boom: prices rise for innocent reasons." label={judgement ? inRule(judgement.harm) : ''} />
        <Tile name="Talk" value={talkTile} on={judgement?.talkPlus} means="Do messages look like coordination? Uses your own monitor's flags."
          fails="Flags talk with no action, and misses silent cartels." label={scores.talk === null ? 'Not available' : judgement ? inRule(judgement.talkPlus) : ''} />
        <Tile name="Correlation" value={`${fmt(scores.corr)} vs ${fmt(FROZEN_SINGLE.corr)}`} on={scores.corr > FROZEN_SINGLE.corr} means="Do prices move together?"
          fails="Shared shocks make every market look coordinated. It is not used in the rule." label={scores.corr > FROZEN_SINGLE.corr ? 'Above threshold' : 'Below threshold'} />
        <Tile name="Influence" value={th && mode === 'pairwise' ? `${fmt(scores.influence)} vs ${fmt(th.influence)}` : fmt(scores.influence)} on={judgement?.inflPlus}
          means="Does a seller's price follow a rival's last price?" fails="Misses a cartel that holds a price without reacting."
          label={!scores.influenceReliable ? 'Unreliable under 20 rounds, left out' : mode === 'restOfMarket' ? 'No threshold in auction mode' : judgement ? inRule(judgement.inflPlus) : ''} />
      </div>

      <h3>Prices by round</h3>
      <p className="hint">{scores.accused ? `Most mutual influence: ${log.agents[a]} and ${log.agents[b]} (thicker lines). This names a pair of sellers whose prices move together in response to each other. It is not an accusation.` : 'Each line is one seller.'}</p>
      <div className="chart" role="img" aria-label={`Prices by round for ${log.agents.length} sellers`}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
            <YAxis domain={['auto', 'auto']} label={{ value: 'Price', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            {log.benchmark && <Line dataKey="Fair price" stroke="currentColor" strokeDasharray="6 4" dot={false} strokeWidth={2} isAnimationActive={false} />}
            {log.agents.map((ag, i) => (
              <Line key={ag} dataKey={ag} stroke={COLORS[i % COLORS.length]} dot={false} connectNulls strokeWidth={i === a || i === b ? 3 : 1.5} strokeOpacity={scores.accused && i !== a && i !== b ? 0.5 : 1} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {scores.influenceMatrix && <Heatmap names={log.agents} m={scores.influenceMatrix} pair={scores.accused} />}
      {scores.perSeller && (
        <>
          <h3>Influence of the rest of the market, per seller</h3>
          <ul className="plain">{log.agents.map((ag, i) => <li key={ag}>{ag}: {fmt(scores.perSeller![i])}</li>)}</ul>
        </>
      )}
      {log.messages && <Messages log={log} />}

      <div className="actions">
        <button onClick={onCopy}>Copy results as JSON</button>
        <span role="status" className="muted">{copied}</span>
      </div>
    </>
  );
}

function Tile({ name, value, unit, on, means, fails, label }: { name: string; value: string; unit?: string; on?: boolean; means: string; fails: string; label: string }) {
  return (
    <div className={`tile ${on ? 'hit' : ''}`}>
      <div className="tile-name">{name}</div>
      <div className="tile-val">{value}</div>
      <div className="tile-state">{on ? '● ' : '○ '}{label}</div>
      {unit && <div className="hint">{unit}</div>}
      <div className="hint"><b>Asks:</b> {means}</div>
      <div className="hint"><b>Known failure:</b> {fails}</div>
    </div>
  );
}

function Heatmap({ names, m, pair }: { names: string[]; m: number[][]; pair: [number, number] | null }) {
  const max = Math.max(0.0001, ...m.flat());
  return (
    <>
      <h3>Who follows whom</h3>
      <p className="hint">Row follows column. Darker means the row seller's price depends more on the column seller's last price. Outlined cells are the strongest pair.</p>
      <div className="heat" style={{ gridTemplateColumns: `auto repeat(${names.length}, minmax(34px, 1fr))` }} role="table" aria-label="Influence matrix">
        <div />
        {names.map((n) => <div key={n} className="heat-h" role="columnheader" title={n}>{n.slice(0, 6)}</div>)}
        {m.map((row, i) => (
          <HeatRow key={names[i]} name={names[i]} row={row} i={i} max={max} pair={pair} />
        ))}
      </div>
    </>
  );
}

function HeatRow({ name, row, i, max, pair }: { name: string; row: number[]; i: number; max: number; pair: [number, number] | null }) {
  return (
    <>
      <div className="heat-h" role="rowheader" title={name}>{name.slice(0, 6)}</div>
      {row.map((v, j) => {
        const hot = pair !== null && ((pair[0] === i && pair[1] === j) || (pair[1] === i && pair[0] === j));
        return (
          <div key={j} role="cell" className={`heat-c ${hot ? 'hot' : ''}`} style={{ background: i === j ? 'transparent' : `rgba(37,99,235,${(v / max) * 0.85})` }}>
            {i === j ? '' : v.toFixed(2)}
          </div>
        );
      })}
    </>
  );
}

function Messages({ log }: { log: ParsedLog }) {
  const lens = messageLengthByRound(log.messages!);
  const data = lens.map((v, t) => ({ round: log.rounds[t], 'Characters per message': Math.round(v) }));
  return (
    <>
      <h3>Messages: average length by round</h3>
      <p className="hint">Shows when messages get shorter. It does not judge what they say.</p>
      <div className="chart" role="img" aria-label="Average message length by round">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="round" />
            <YAxis />
            <Tooltip />
            <Line dataKey="Characters per message" stroke="#2563eb" dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
