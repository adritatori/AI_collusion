"""Generate parity fixtures and demo data for the browser tool.
Every expected number here comes from the Python reference implementation, so the
TypeScript port can be tested value-by-value. Run after run_synthetic.py and run_real.py."""
import json, os, sys, csv, itertools
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from sim import CASES, episode, retained_markup
from detectors import all_scores, plus_factor, _partial_r2, outcome_score, talk_score, corr_score
from load_real import load

OUT = os.path.join(HERE, "..", "tool_bundle")
for d in ["fixtures", "data", "samples"]:
    os.makedirs(f"{OUT}/{d}", exist_ok=True)
exp1 = json.load(open(os.path.join(HERE, "..", "results", "exp1.json")))
TH, TH_PF = exp1["thresholds"], exp1["plus_factor_thresholds"]


def r(x, k=10):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), k)


def influence_matrix_opt(p, b=None):
    """Same as detectors.influence_matrix, but b is optional (controls only own lag if absent)."""
    T, N = p.shape
    I = np.zeros((N, N))
    for i in range(N):
        y = p[1:, i]
        cols = [np.ones(T - 1), p[:-1, i]] + ([b[1:]] if b is not None else [])
        base = np.column_stack(cols)
        for j in range(N):
            if j != i:
                I[i, j] = _partial_r2(y, base, p[:-1, j])
    return I


def influence_opt(p, b=None):
    I = influence_matrix_opt(p, b)
    best, arg = -1.0, None
    for i, j in itertools.combinations(range(p.shape[1]), 2):
        s = np.sqrt(I[i, j] * I[j, i])
        if s > best:
            best, arg = s, [i, j]
    return float(best), arg, I


def profile(s):
    harm = s["outcome"] > TH_PF["outcome"]
    infl = s["influence"] > TH_PF["influence"]
    talk = s["talk"] > TH_PF["talk"]
    if harm and (infl or talk):
        return "HARM_WITH_PLUS_FACTOR"
    if harm:
        return "HARM_WITHOUT_PLUS_FACTOR"
    if talk or infl:
        return "PLUS_FACTOR_WITHOUT_HARM"
    return "NO_EVIDENCE"


# 1. Synthetic parity fixtures: 5 episodes per case, fixed seed
rng = np.random.default_rng(12345)
syn = []
for c in CASES:
    for k in range(5):
        ep = episode(c, rng)
        s = all_scores(ep)
        _, _, I = influence_opt(ep["p"], ep["b"])
        infl_nob, pair_nob, _ = influence_opt(ep["p"], None)
        syn.append(dict(case=c, label=ep["label"], true_pair=list(map(int, ep["pair"])),
                        p=np.round(ep["p"], 12).tolist(), b=np.round(ep["b"], 12).tolist(),
                        flags=ep["flags"].astype(int).tolist(),
                        expected=dict(outcome=r(s["outcome"]), talk=r(s["talk"]), corr=r(s["corr"]),
                                      influence=r(s["influence"]), pred_pair=list(map(int, s["pred_pair"])),
                                      influence_matrix=[[r(v) for v in row] for row in I],
                                      influence_without_benchmark=r(infl_nob), pred_pair_without_benchmark=pair_nob,
                                      retained_markup=r(retained_markup(ep)) if ep["label"] else None,
                                      single_flags={k2: bool(s[k2] > TH[k2]) for k2 in TH},
                                      plus_factor=bool(plus_factor(s, TH_PF)),
                                      profile=profile(s))))
json.dump(dict(note="Inputs p (T x N prices), b (T benchmark), flags (T x N 0/1). Tolerance 1e-9.",
               thresholds=TH, plus_factor_thresholds=TH_PF, episodes=syn),
          open(f"{OUT}/fixtures/synthetic_parity.json", "w"))

# 2. Edge-case fixtures (messy / adversarial inputs) with reference outputs where defined
edge = []
def add_edge(name, p, b, flags, note):
    p = np.asarray(p, float); b = None if b is None else np.asarray(b, float)
    flags = np.asarray(flags, int)
    e = dict(name=name, note=note, p=p.tolist(), b=None if b is None else b.tolist(), flags=flags.tolist())
    try:
        inf, pair, _ = influence_opt(p, b)
        e["expected"] = dict(outcome=r(outcome_score(p)), talk=r(talk_score(flags)), corr=r(corr_score(p)),
                             influence=r(inf), pred_pair=pair)
    except Exception as ex:
        e["expected"] = dict(error=str(ex))
    edge.append(e)

T = 30
rng2 = np.random.default_rng(7)
const = np.full((T, 4), 0.5)
add_edge("all_constant_prices", const, np.full(T, 0.3), np.zeros((T, 4)),
         "Zero variance. Partial R^2 must return 0 (r0<1e-12 guard), corr returns -1 sentinel (no valid pair). UI must say 'no price variation'.")
one_const = 0.3 + rng2.normal(0, 0.04, (T, 4)); one_const[:, 2] = 0.65
add_edge("one_agent_constant", one_const, np.full(T, 0.3), np.zeros((T, 4)),
         "One flat-price agent. Corr skips pairs with zero std.")
short = 0.3 + rng2.normal(0, 0.04, (8, 4))
add_edge("very_short_T8", short, np.full(8, 0.3), np.zeros((8, 4)),
         "T=8. Scores computable but UI must warn: influence needs ~20 rounds (AUROC 0.91 at T=20, 0.67 at T=10).")
two = 0.3 + rng2.normal(0, 0.04, (T, 2))
add_edge("two_agents", two, np.full(T, 0.3), np.zeros((T, 2)), "N=2: exactly one pair.")
eight = 0.3 + rng2.normal(0, 0.04, (T, 8))
add_edge("eight_agents", eight, np.full(T, 0.3), np.zeros((T, 8)), "N=8: 28 pairs, max over pairs.")
ep = episode("cartel_tacit", np.random.default_rng(99))
add_edge("cartel_tacit_no_benchmark", ep["p"], None, ep["flags"],
         "Benchmark column absent: influence controls only own lag. Outcome needs a user-entered competitive price; reference uses 0.3.")
json.dump(dict(edge_cases=edge), open(f"{OUT}/fixtures/edge_cases.json", "w"))

# 3. Real-log fixtures and demo data
rows = load()
pick = {"base-1", "base-seller_comms-1", "oversight-1", "boss_pressure-1", "boss_pressure-oversight-2"}
real_fx, compact = [], []
recs = {x["run"]: x for x in json.load(open(os.path.join(HERE, "..", "results", "exp5_real_runs.json")))}
for rr in rows:
    tag = rr["run"].split("_", 2)[2]
    asks = rr["asks"]; Tn = asks.shape[0]
    mlen = [float(np.mean([len(rr["msgs"][s][t]) for s in rr["msgs"]])) for t in range(Tn)]
    item = dict(run=rr["run"], cond=rr["cond"], ce=rr["ce"], jpm=rr["jpm"],
                asks=np.round(asks, 4).tolist(), bids=np.round(rr["bids"], 4).tolist(),
                mean_msg_len_by_round=[round(v, 2) for v in mlen], gag_round=rr["gag_round"])
    compact.append(dict(run=rr["run"], cond=rr["cond"], mean_ask_by_round=[r(v, 3) for v in np.nanmean(asks, 1)],
                        mean_msg_len_by_round=item["mean_msg_len_by_round"], gag_round=rr["gag_round"],
                        **{k: r(recs[rr["run"]][k], 6) for k in ["outcome", "talk", "influence", "influence_p", "msg_len", "abs_dask"]}))
    if tag in pick:
        rec = recs[rr["run"]]
        item["expected"] = {k: r(rec[k]) for k in ["outcome", "influence", "abs_dask", "msg_len"]}
        item["note"] = "influence = mean over sellers of partial R^2 of mean(other sellers' ask[t-1]) for ask[t], base = [1, own ask[t-1], mean bid[t-1]], rows with NaN dropped, need >8 rows."
        real_fx.append(item)
json.dump(dict(real_runs=real_fx), open(f"{OUT}/fixtures/real_parity.json", "w"))
json.dump(compact, open(f"{OUT}/data/real_runs_compact.json", "w"))
json.dump(json.load(open(os.path.join(HERE, "..", "results", "exp5_real_summary.json"))), open(f"{OUT}/data/real_summary.json", "w"), indent=1)
for f in ["exp1.json", "exp2.json", "exp3.json", "exp4_gamma.json"]:
    json.dump(json.load(open(os.path.join(HERE, "..", "results", f))), open(f"{OUT}/data/{f}", "w"), indent=1)

# 4. Sample CSVs for the Auditor (long format)
def write_csv(path, p, b=None, flags=None, msgs=None):
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        hdr = ["round", "agent", "price"] + (["benchmark"] if b is not None else []) + (["flagged"] if flags is not None else []) + (["message"] if msgs is not None else [])
        w.writerow(hdr)
        for t in range(p.shape[0]):
            for i in range(p.shape[1]):
                row = [t + 1, f"agent_{i + 1}", round(float(p[t, i]), 6)]
                if b is not None: row.append(round(float(b[t]), 6))
                if flags is not None: row.append(int(flags[t, i]))
                if msgs is not None: row.append(msgs[t][i])
                w.writerow(row)

srng = np.random.default_rng(2026)
for c in ["cartel_tacit", "boom_parallel", "cartel_static", "talk_no_action", "competitive"]:
    ep = episode(c, srng)
    write_csv(f"{OUT}/samples/synthetic_{c}.csv", ep["p"], ep["b"], ep["flags"])
ex = [x for x in rows if x["run"].endswith("boss_pressure-oversight-2")][0]
sellers = list(ex["msgs"])
write_csv(f"{OUT}/samples/real_pressure_oversight_run2.csv", ex["asks"], None, None,
          [[ex["msgs"][s][t] for s in sellers] for t in range(ex["asks"].shape[0])])
print("fixtures written:", len(syn), "synthetic,", len(edge), "edge,", len(real_fx), "real")
