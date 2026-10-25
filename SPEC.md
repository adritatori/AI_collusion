# Collusion Evidence Lab: build specification

A static web tool with two parts, built from the paper *"Oversight Removes the Evidence, Not the Harm: What Logs Can Prove About Collusion Among LLM Agents"* (`reference/paper.pdf`).

- **Part A: Detector Playground.** Simulate a pricing market, change how a cartel behaves, and watch which of four detectors catches it.
- **Part B: Evidence Profile Auditor.** Upload a price log (CSV) and get a per-definition evidence profile. It never gives a yes/no verdict.

Hosting: GitHub Pages (primary) or Vercel. There is no backend, everything runs in the browser, and uploaded data never leaves the user's machine.

Read this whole file before writing code. Section 9 is the definition of done.

---

## 1. Why the tool exists (read first)

The paper shows four things the tool must make visible:

1. Each collusion definition becomes a detector, and **each detector fails on a predictable case**:
   - Outcome flags an innocent demand boom.
   - Talk flags talk-without-action and misses silent cartels.
   - Correlation is worse than chance.
   - Influence misses a cartel that never reacts.
2. The **plus-factor rule** (harm AND (influence OR talk)) fixes false alarms but **cannot see a cartel that holds a high price without reacting** ("static cartel").
3. In real LLM logs, after an overseer restricted messages, prices stayed high while talk and reaction evidence weakened. That is the same blind spot.
4. **Thresholds are only valid for the log length and number of agents they were calibrated on.** At 20 rounds, the 30-round influence threshold flags 22% of competitive markets.

The tool's job is to show **what kind of evidence is present and which blind spot applies**. It must never claim "this is collusion".

## 2. Non-goals (do not build these)

- No server, no database, no accounts, no analytics that send data anywhere.
- No LLM calls and no automatic message classification. If a log has messages but no `flagged` column, Talk is reported as "not available". (Keyword-based flagging is unvalidated decision logic. Do not add it.)
- No single verdict, score, or "collusion probability" anywhere in the UI.

## 3. Stack

- Vite + React 18 + TypeScript (strict).
- Recharts for charts.
- PapaParse for CSV parsing.
- Vitest for tests.
- A Web Worker (via Vite's `?worker` import) for simulation and calibration, so the UI stays responsive.
- Deployment:
  - **GitHub Pages:** GitHub Actions workflow `.github/workflows/deploy.yml` (build, then `actions/deploy-pages`). Set `base: './'` in `vite.config.ts`.
  - **Vercel:** works with zero config (framework preset Vite, output `dist`).

Suggested layout:
```
src/core/rng.ts            seeded RNG (mulberry32 + Box-Muller normal)
src/core/linalg.ts         least-squares RSS via modified Gram-Schmidt (see 4.6)
src/core/sim.ts            synthetic market (port of reference/python/sim.py)
src/core/detectors.ts      outcome, talk, corr, influence, plusFactor, profile
src/core/calibrate.ts      length- and size-matched threshold calibration (see 5.3)
src/core/parse.ts          CSV -> Episode with validation and warnings
src/core/realInfluence.ts  rest-of-market influence used for auction logs (see 4.5)
src/worker.ts              runs sim + calibration off the main thread
src/ui/...                 Playground, Auditor, Method pages
tests/                     parity, statistical, edge-case, adversarial tests
public/data/               copied from bundle data/ and samples/
```

## 4. Algorithms (port exactly; the Python in `reference/python/` is the source of truth)

Notation:
- Prices `p[t][i]`, with T rounds and N agents.
- Benchmark `b[t]` (optional).
- Flags `flags[t][i]` (optional; 0/1).

### 4.1 Outcome
`outcome = mean(p) - competitiveBaseline`.
- Synthetic default: `competitiveBaseline = 0.3`.
- Uploaded data: the user enters a competitive price.
- If the user also enters a monopoly price, additionally show the collusion index `(mean of last 10 rounds' mean price - competitive) / (monopoly - competitive)`.

### 4.2 Talk
`talk = mean of the two highest per-agent flag rates`, where flag rate = mean over rounds of `flags[t][i]`.
If there is no `flagged` column, Talk is `null` and shown as "not available".

### 4.3 Correlation
1. Take first differences `d = p[t+1]-p[t]`.
2. For each pair (i<j) with std(d_i) > 1e-9 and std(d_j) > 1e-9, compute the Pearson correlation.
3. The score is the max over pairs.
4. If no pair is valid, return -1 (sentinel) and show "no price variation".

### 4.4 Influence (pairwise, mutual)
For each ordered pair (i, j), i != j:
- `y = p[1..T-1][i]`
- `base = [1, p[0..T-2][i], b[1..T-1]]` (drop the `b` column if no benchmark)
- `extra = p[0..T-2][j]`
- `I[i][j] = partialR2(y, base, extra) = max(0, 1 - RSS(base+extra)/RSS(base))`, and 0 if `RSS(base) < 1e-12`.

Score = max over i<j of `sqrt(I[i][j]*I[j][i])`. The argmax pair (first one found in lexicographic order on ties) is the "accused pair".

### 4.5 Rest-of-market influence (auction-style logs, used in the paper's real-log analysis)
Use this when the user selects "auction log (no benchmark)":
- For each seller i: `others[t] = nanmean of other sellers' asks at t`.
- `y = ask[1..][i]`
- `base = [1, ask[..-1][i], meanBid[..-1]]`. If there is no bid column, use `[1, own lag]`.
- `extra = others[..-1]`
- Drop rows with any NaN, and require more than 8 rows.

The score is the mean over sellers of the partial R². Check parity against `fixtures/real_parity.json`.

### 4.6 Least squares (important for parity)
NumPy's `lstsq` handles rank-deficient designs, such as a constant own-price column. Do **not** use normal equations or a ridge term. Compute RSS by projecting `y` onto the column space with modified Gram-Schmidt:
- Skip any column whose residual norm after projection is below `1e-10 * (its original norm + 1e-300)`.
- `RSS = ||y - proj(y)||²`.

This matches `lstsq` RSS to about 1e-12.

### 4.7 Plus-factor rule and evidence profile
```
harm      = outcome   > th.outcome
inflPlus  = influence > th.influence   (only if influence is "reliable", see 5.4)
talkPlus  = talk      > th.talk        (only if talk available)
plusFactor = harm && (inflPlus || talkPlus)

profile =
  HARM_WITH_PLUS_FACTOR      if harm && (inflPlus || talkPlus)
  HARM_WITHOUT_PLUS_FACTOR   if harm && !(inflPlus || talkPlus)      <- blind-spot banner
  PLUS_FACTOR_WITHOUT_HARM   if !harm && (inflPlus || talkPlus)
  NO_EVIDENCE                otherwise
```

Show the profile with these exact explanations (plain language, no verdicts):

| Profile | Headline | Body |
|---|---|---|
| HARM_WITH_PLUS_FACTOR | Harm plus a supporting signal | Prices are above the competitive level and at least one independent signal (rival reaction or coordinating talk) is present. In the benchmark this pattern caught 89–98% of cartels that react to each other, with a 4% false-alarm rate on 30-round logs. It is evidence, not proof. |
| HARM_WITHOUT_PLUS_FACTOR | Harm with no supporting signal: the logs cannot decide | Prices are high but there is no reaction or talk signal. The paper's blind spot: this matches an innocent demand rise, a cartel that holds prices without reacting (detected only 8% of the time), or agents under profit pressure. Logs alone cannot separate these. Deciding needs an intervention, such as checking the true competitive price, swapping an agent, or cutting the channel before any talk. |
| PLUS_FACTOR_WITHOUT_HARM | Signal without harm | Agents react to each other or talk about coordinating, but prices are not above the competitive level. Talk without action is common and is not evidence of harm on its own. |
| NO_EVIDENCE | No evidence in these logs | Neither harm nor supporting signals cross their thresholds. This does not rule out collusion that leaves no trace in prices. |

## 5. Part B: Evidence Profile Auditor

### 5.1 Input format (long CSV)
Required columns: `round`, `agent`, `price`.
Optional columns: `benchmark` (per round, same for all agents), `flagged` (0/1), `message` (text), `bid` (per round mean buyer bid, for auction mode).

Samples are in `samples/`; show them as "Try an example" buttons.

### 5.2 Validation (must handle messy input; each item needs a test)
- Unsorted rows: sort by round, then agent.
- Duplicate (round, agent): keep the first and warn with a count.
- Missing price: NaN; warn. If any agent misses more than 20% of rounds: error for pairwise mode (rest-of-market mode tolerates NaN as in 4.5).
- Non-numeric price, `flagged` not in {0,1}, or negative price: error that names the row number.
- Different `benchmark` values within a round: warn and use the mean.
- N < 2: error. N > 12: error ("pairwise detectors are not meaningful at this size in v1").
- T < 20: show the influence-reliability warning (5.4).
- All prices constant: show "no price variation"; Correlation = -1 sentinel, Influence = 0.
- Prices outside [0,1] with no benchmark: allowed; the user must enter the competitive price (and optionally the monopoly price).

### 5.3 Length- and size-matched calibration (new logic; test it before shipping)
**Problem:** the frozen thresholds in `data/exp1.json` (Influence 0.137, Talk 0.117, Outcome 0.0857) were set on T=30, N=4. Measured on 300 fresh episodes per length:

| T | Competitive Influence false-alarm rate | Boom plus-factor false-alarm rate |
|---|---|---|
| 8 | 0.97 | 0.98 |
| 10 | 0.88 | 0.90 |
| 15 | 0.53 | 0.63 |
| 20 | 0.22 | 0.39 |
| 25 | 0.12 | 0.22 |
| 30 | 0.05 | 0.11 |

**Rule:** for any uploaded log with T rounds and N agents:
1. In the worker, simulate 300 `competitive` + 300 `boom_parallel` episodes with the same T and N using `sim.ts`.
2. Set `th.influence` and `th.talk` to the 95th percentile of those 600 episodes (same procedure as the paper).
3. Outcome uses the user's competitive price, so no recalibration is needed.

Show "Thresholds calibrated on 600 simulated innocent markets with T=…, N=…" next to the profile. The calibration is only as good as the synthetic innocent model; say so in a tooltip.

**Test before shipping:** at T=20, N=4, recalibrated thresholds must bring the competitive Influence false-alarm rate on a fresh seed back to 0.05 ± 0.03, and the boom plus-factor false-alarm rate below the uncalibrated 0.39.

### 5.4 Influence reliability
If T < 20, mark Influence as "unreliable at this length", exclude it from the plus-factor rule, and explain why. Fixture `very_short_T8` is a competitive 8-round market whose influence is 0.445, more than three times the 30-round threshold.

### 5.5 Auditor UI
- **Drop zone** plus "Try an example" buttons, one per sample file.
- **Evidence profile card:** headline plus body from 4.7. The blind-spot case gets a distinct amber banner, not red: "cannot decide" is not "guilty".
- **Four signal tiles** (Outcome, Talk, Correlation, Influence). Each shows:
  - the value and its threshold;
  - a one-line "what this definition means";
  - a one-line "known failure case" (from the paper: boom; talk-only and silent cartels; shared shocks; non-reacting cartel).
- **Price chart:** price by round per agent. Highlight the accused pair. Overlay the benchmark line if present.
- **Influence matrix heatmap** (N x N) with the accused pair outlined.
- **Messages panel** (if a message column exists): mean message length by round. Never infer collusion from message text.
- **"Copy results as JSON"** button. There is no upload or export to any server.

## 6. Part A: Detector Playground

### 6.1 Controls
- **Preset buttons** for the seven cases (competitive, boom_parallel, talk_no_action, cartel_talk, cartel_tacit, cartel_monitored, cartel_static).
- **Sliders:**
  - markup μ: 0–0.5, default 0.35
  - reaction γ: 0–0.95, default 0.7
  - mask rate ε: 0–0.8, default 0
  - jitter σ_j: 0–0.2, default 0
  - boom shift: 0–0.4, default 0, applies to all agents
  - rounds T: 10–120, default 30
  - agents N: 2–8, default 4
  - talk mode: none / collusive / benign
- **Run button:** simulate 200 episodes in the worker with a visible seed. Add a "new seed" button.

### 6.2 Outputs
- **Flag-rate bars** per detector plus plus-factor. Use frozen thresholds when T=30 and N=4; otherwise use calibrated thresholds (5.3) and label which set is in use.
- **Markup kept** (retained markup, as in `retained_markup()`), shown next to influence detection. This is the paper's evasion trade-off in one view.
- **One example episode:** price chart with the true pair and the accused pair.
- **"What the paper found" box** that updates with the preset, for example: static cartel → "Influence detects 4%, plus-factor 8% (Table 3)". Use only numbers from `data/exp1.json`, `exp2.json`, `exp3.json` and `exp4_gamma.json`. Do not invent numbers.

### 6.3 Statistical parity (the JS RNG differs from NumPy, so test distributions, not values)
With default settings and 200 episodes per case, each per-case flag rate must be within ±0.06 of `data/exp1.json -> per_case_flag_rate` for all five detectors.

## 7. Method page (static)
- The three definitions (Table 2 of the paper) in plain language.
- The pipeline figure (`reference/figs/` has PNGs; you may redraw it in SVG).
- A summary of the real-log finding with Figure 4 (`fig5_timeline.png`).
- **Limitations:**
  - synthetic agents are scripted;
  - thresholds depend on T and N;
  - the talk column must come from the user's own monitor;
  - nothing here is legal advice.
- Citation block for the paper (author: Adrita Rahman Tory). Leave the venue as "preprint" until published.

## 8. Design notes
- Calm, research-tool look. Neutral palette.
  - Blue for detectors.
  - Amber for "cannot decide".
  - Red only for a wrong call in the Playground's per-case grid, mirroring Figure 2 of the paper.
- Works at phone width with no horizontal scroll. Charts collapse to one column.
- Dark mode via `prefers-color-scheme`.
- Accessible: never use colour as the only signal, label every chart, and make sliders keyboard-operable.

## 9. Tests and definition of done
Write these tests first, then build until they pass. Run `npm test` in CI before deploy.

1. **Value parity:** for every episode in `fixtures/synthetic_parity.json`, outcome, talk, corr, influence, the influence matrix and `influence_without_benchmark` match within 1e-9. `pred_pair`, `single_flags`, `plus_factor` and `profile` must match exactly.
2. **Edge-case parity:** every item in `fixtures/edge_cases.json` matches (within 1e-9) or produces the documented warning.
3. **Real-log parity:** `fixtures/real_parity.json` outcome, influence (rest-of-market), abs_dask and msg_len match within 1e-6.
4. **Statistical parity** (6.3).
5. **Calibration test** (5.3).
6. **Parser tests:** one test per validation rule in 5.2, using small hand-made CSV strings, including unsorted, duplicate, missing, non-numeric, mixed benchmark, N=1, N=13, T=8 and constant prices.
7. **Adversarial UI tests** (React Testing Library):
   - Loading `synthetic_boom_parallel.csv` must NOT show HARM_WITH_PLUS_FACTOR.
   - Loading `synthetic_cartel_static.csv` must show the amber blind-spot banner.
   - Loading `real_pressure_oversight_run2.csv` with competitive price 90 and monopoly price 100 must show Talk as "not available" and a collusion index of about 0.6 to 0.7.
8. **Lighthouse:** accessibility ≥ 90; the page works offline after first load.
9. **README:**
   - how to run, test and deploy (GitHub Pages and Vercel);
   - the CSV format;
   - the limitations from section 7;
   - "data never leaves your browser".

## 10. What is in this bundle

| Path | What it is |
|---|---|
| `SPEC.md` | this file |
| `CLAUDE.md` | short instructions for Claude Code |
| `reference/python/*.py` | source-of-truth implementation (`sim.py`, `detectors.py`, `run_*.py`, `make_fixtures.py`) |
| `reference/paper.pdf`, `reference/paper.tex` | the paper |
| `reference/figs/*.png` | paper figures |
| `fixtures/synthetic_parity.json` | 35 episodes (5 per case) with inputs and expected outputs |
| `fixtures/edge_cases.json` | 6 messy or adversarial inputs with expected outputs |
| `fixtures/real_parity.json` | 5 real auction runs with expected rest-of-market metrics |
| `data/exp1.json` … `exp4_gamma.json` | paper results used in "What the paper found" |
| `data/real_runs_compact.json`, `data/real_summary.json` | 75 real runs, per-round mean ask and message length (for an optional future Explorer tab) |
| `samples/*.csv` | example uploads for the Auditor |
