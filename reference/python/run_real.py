"""Exp 5: apply the same detectors to the 75 released LLM double-auction runs
(Agrawal et al. 2025). Zero API calls.

outcome   = collusion index of last-10-round mean seller ask: (ask - CE) / (JPM - CE)
talk      = authors' LLM-judge coordination score on sellers' private reasoning
influence = mean over sellers of partial R^2 of other sellers' mean ask at t-1 for
            predicting own ask at t, controlling own ask at t-1 and mean buyer bid at t-1
msg_len   = mean characters per seller message (channel-use proxy)
Also writes message statistics (share of messages that are literally 'ok')."""
import json, os, sys, collections
import numpy as np
from scipy.stats import mannwhitneyu
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from load_real import load
from detectors import _partial_r2

OUT = os.path.join(HERE, "..", "results")
N_NULL = 100
rng = np.random.default_rng(0)


def _infl(asks, bids, perm=None):
    T, N = asks.shape
    out = []
    for i in range(N):
        others = np.nanmean(np.delete(asks, i, axis=1), axis=1)
        if perm is not None:
            others = others[perm]
        y = asks[1:, i]
        X = np.column_stack([np.ones(T - 1), asks[:-1, i], bids[:-1]])
        ok = ~np.isnan(y) & ~np.isnan(X).any(1) & ~np.isnan(others[:-1])
        if ok.sum() > 8:
            out.append(_partial_r2(y[ok], X[ok], others[:-1][ok]))
    return float(np.mean(out)) if out else np.nan


def null_influence(asks, bids, n=N_NULL):
    """Permutation null: shuffle the rival series in time, keeping own dynamics intact."""
    return np.array([_infl(asks, bids, rng.permutation(asks.shape[0])) for _ in range(n)])


rows = load()
recs, msgstats = [], {}
for r in rows:
    last = np.nanmean(r["asks"][-10:])
    infl = _infl(r["asks"], r["bids"])
    null = null_influence(r["asks"], r["bids"])
    msgs = [m for s in r["msgs"].values() for m in s if m]
    recs.append(dict(run=r["run"], cond=r["cond"], comms=r["comms"], oversight=r["oversight"],
                     pressure=r["pressure"],
                     outcome=float((last - r["ce"]) / (r["jpm"] - r["ce"])),
                     talk=r["judge_score"], influence=infl,
                     influence_p=float((null >= infl).mean()),
                     msg_len=float(np.mean([len(m) for m in msgs])) if msgs else 0.0,
                     gag_round=r["gag_round"],
                     abs_dask=float(np.nanmean(np.abs(np.diff(r["asks"], axis=0)))),
                     first_ask=float(np.nanmean(r["asks"][0]))))
    ms = msgstats.setdefault(r["cond"], collections.Counter())
    for m in msgs:
        s = m.strip().lower()
        ms["total"] += 1
        ms["ok"] += s in ("ok", "ok.")
        ms["le5"] += len(s) <= 5
        ms["no_letters"] += not any(ch.isalpha() for ch in s)

json.dump(recs, open(f"{OUT}/exp5_real_runs.json", "w"), indent=2)
json.dump({k: dict(v) for k, v in msgstats.items()}, open(f"{OUT}/exp5_msgstats.json", "w"), indent=2)
g = collections.defaultdict(list)
for x in recs:
    g[x["cond"]].append(x)


def ci(v):
    v = np.array([a for a in v if not np.isnan(a)])
    bs = [rng.choice(v, len(v)).mean() for _ in range(2000)]
    return float(v.mean()), float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))


summary = {}
for c, xs in g.items():
    summary[c] = dict(n=len(xs), **{k: ci([x[k] for x in xs]) for k in ["outcome", "talk", "influence", "msg_len", "abs_dask"]},
                      gag_rounds=[x["gag_round"] for x in xs],
                      frac_influence_sig=float(np.mean([x["influence_p"] < 0.05 for x in xs])))
    s = summary[c]
    print(f"{c:42s} n={s['n']:2d} outcome={s['outcome'][0]:+.2f} talk={s['talk'][0]:.2f} "
          f"infl={s['influence'][0]:.3f} sig={s['frac_influence_sig']:.2f} msglen={s['msg_len'][0]:.0f}")

tests = {}
for a, b in [("boss_pressure", "boss_pressure-oversight"), ("base-seller_comms", "oversight"),
             ("base", "boss_pressure-oversight"), ("base", "base-seller_comms"), ("base", "boss_pressure"),
             ("base-seller_comms", "boss_pressure")]:
    tests[f"{a} vs {b}"] = {k: float(mannwhitneyu([x[k] for x in g[a]], [x[k] for x in g[b]]).pvalue)
                            for k in ["outcome", "talk", "influence", "msg_len", "abs_dask"]}
    print(a, "vs", b, {k: round(v, 4) for k, v in tests[f"{a} vs {b}"].items()})
json.dump(dict(summary=summary, tests=tests), open(f"{OUT}/exp5_real_summary.json", "w"), indent=2)
for c, v in msgstats.items():
    print(c, dict(v))
