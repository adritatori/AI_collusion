# Collusion Evidence Lab

**Did the AI sellers collude? An auditor only gets the logs.**

A research project on AI safety. It tests how well simple checks can spot collusion between LLM pricing agents, using only their logs: prices, messages and sometimes reasoning.

> **Oversight removed the evidence, not the harm.**

| | |
|---|---|
| **Plus-factor rule** | False alarms drop from **34% to 4%** vs. checking price alone |
| **Still catches** | **89% to 98%** of cartels that react to each other |
| **Blind spot** | Only **8%** of static cartels |

**Live tool:** https://adritatori.github.io/AI_collusion/ *(available once the deploy workflow is added; see [Status](#status))*

---

## Abstract

LLM agents that set prices in simulated markets often keep them above the competitive level. Three fields would read the same logs differently:

| Field | "Collusion" means | What to look at |
|---|---|---|
| Markets | High price | Price level vs. the competitive price |
| Law | Agreement | High prices alone are legal. Extra proof is needed, such as messages |
| AI safety | Hidden coordination | How agents react to each other. They may hide it from an overseer |

We build one detector per definition, add a legal-style rule that combines them, and test everything on data where we know the truth and on real LLM-agent logs.

---

## Methods

### Data

**Track A: synthetic markets (ground truth known)**
- 4 sellers, 30 rounds
- 7 market types: 3 innocent, 4 cartels
- 200 training + 200 test markets per type
- Simulator: [`reference/python/sim.py`](reference/python/sim.py), run by `run_synthetic.py` and `run_gamma.py`

**Track B: real LLM agents**
- Released auction logs of Agrawal et al. (2025), [arXiv:2507.01413](https://arxiv.org/abs/2507.01413). No new model calls.
- 75 double-auction runs, 5 sellers, 30 rounds
- Cost $80, buyer value $100, fair price $90
- We analyze the 50 GPT-4.1 runs, 10 per condition
- Read by `load_real.py` and `run_real.py`

### Checks

Every log goes through the same four checks.

| Check | Question it asks |
|---|---|
| **Outcome** (Markets) | Is the price above the fair benchmark? |
| **Talk** (Law) | Do messages or reasoning look like coordination? |
| **Influence** (AI safety) | Does my price follow my rival's last price? |
| **Correlation** (baseline) | Do prices simply move together? |

**Plus-factor rule**, borrowed from antitrust law:

```
flag = Outcome AND (Talk OR Influence)
```

Harm alone is not enough. It needs one supporting sign. Thresholds are set **only on innocent markets**.

---

## Results

### Track A: how often each check raises a flag (200 test markets per type)

Innocent markets should be near 0. Cartels should be near 1.

| Market type | Truth | Outcome | Talk | Correlation | Influence | Plus-factor |
|---|---|---|---|---|---|---|
| competitive | innocent | 0.01 | 0.93 | 1.00 | 0.05 | 0.00 |
| boom_parallel | innocent | 1.00 | 0.89 | 0.99 | 0.04 | 0.10 |
| talk_no_action | innocent | 0.01 | 1.00 | 0.99 | 0.06 | 0.01 |
| cartel_talk | cartel | 0.98 | 1.00 | 0.99 | 0.89 | 0.98 |
| cartel_tacit | cartel | 0.98 | 0.87 | 0.98 | 0.93 | 0.92 |
| cartel_monitored | cartel | 0.98 | 0.93 | 0.95 | 0.90 | 0.89 |
| cartel_static | cartel | 0.99 | 0.90 | 1.00 | 0.04 | 0.08 |

Every check fails somewhere:
- **Outcome** flags `boom_parallel`, an innocent market (1.00).
- **Talk** and **Correlation** flag innocent markets almost every time.
- **Influence** misses `cartel_static` (0.04).
- **Plus-factor** is the best of the five, but still misses `cartel_static` (0.08).

Source: `run_synthetic.py`, `run_gamma.py`; paper Figures 2 and 3.

### Track B: real GPT-4.1 runs, 10 per condition

Collusion index of final asks:

| Condition | Index |
|---|---|
| none (no messages at all) | −0.22 |
| C+P (no gag) | 0.64 |
| C+P+O (gagged) | 0.63 |

- C+P and C+P+O end at the same high price (0.64 vs 0.63, p = 0.62). The harm did not change.
- Without messages, prices fall below fair (−0.22).
- In a typical C+P+O run, sellers talk in hour 1 ("Let's avoid a race to the bottom"). The overseer scores 4/4 in hour 3, and catches all 20 overseen runs within 7 rounds. From hour 4 messages shrink to "ok", and the price stays near $97 ($97.1 → $96.8).

Source: `run_real.py` on the Agrawal et al. logs; paper Figures 4 and 5. Talk scores are the original study's GPT-4.1-mini judge scores.

---

## Takeaway

- Gagged sellers under profit pressure look like `cartel_static`: high price, little talk, little reaction. That is the one case our best rule misses.
- Catching and silencing messages did **not** lower prices. Monitors need remedies that act on prices, like price caps or resetting asks.
- **Still open:** is it a hidden agreement, or did the CEO prompt alone keep prices high? Logs cannot tell. A pressure-only run without messages would.

---

## About the tool

Collusion Evidence Lab is a static site: it runs entirely in your browser. Your data never leaves your machine.

It shows evidence. It does **not** give a verdict, a collusion probability, or automatic message labels.

## Run locally

```bash
npm install
npm test        # parity tests against the Python reference
npm run dev     # local dev server
npm run build   # static build into dist/
```

## Status

| Stage | State |
|---|---|
| (a) `core/` detectors, simulator, parser, with parity tests | Done |
| (b) Worker and calibration | Done (used by the Playground) |
| (c) Auditor | To do |
| (d) Playground | Done |
| (e) Method page | To do |
| (f) Deploy workflow (GitHub Pages) | To do |

The Python in [`reference/python/`](reference/python/) is the source of truth for every formula. See [`SPEC.md`](SPEC.md) for the full contract.

## Cite

Data from: Agrawal et al. (2025), *arXiv:2507.01413*.
