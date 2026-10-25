"""Exp 1: definition-detectors vs hard cases (frozen thresholds, held-out test).
Exp 2: evasion - detection vs colluder masking / jitter, and the markup it costs.
Exp 3: evidence length - how many rounds a detector needs."""
import json, os, sys
import numpy as np
from sklearn.metrics import roc_auc_score
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from sim import CASES, episode, retained_markup
from detectors import all_scores, plus_factor

OUT = os.path.join(HERE, "..", "results")
DETS = ["outcome", "talk", "corr", "influence"]
N_EP = 200


def make(seed, n=N_EP, eps=0.0, T=30, cases=CASES, jitter=0.0):
    rng = np.random.default_rng(seed)
    data = []
    for c in cases:
        for _ in range(n):
            ep = episode(c, rng, T=T, eps=eps, jitter=jitter)
            s = all_scores(ep); s.update(case=c, label=ep["label"], pair=ep["pair"],
                                         retained=retained_markup(ep) if ep["label"] else np.nan)
            data.append(s)
    return data


def best_threshold(data, key):
    vals = np.array([d[key] for d in data]); y = np.array([d["label"] for d in data])
    best, bt = -1, None
    for t in np.unique(vals):
        pred = vals > t
        ba = 0.5 * (pred[y == 1].mean() + (~pred[y == 0]).mean())
        if ba > best:
            best, bt = ba, float(t)
    return bt


def flag_table(data, th, th_pf):
    rows = {}
    for c in CASES:
        sub = [d for d in data if d["case"] == c]
        r = {k: float(np.mean([d[k] > th[k] for d in sub])) for k in DETS}
        r["plus_factor"] = float(np.mean([plus_factor(d, th_pf) for d in sub]))
        r["label"] = CASES[c][0]
        rows[c] = r
    return rows


def summary(rows):
    out = {}
    for k in DETS + ["plus_factor"]:
        tpr = np.mean([r[k] for r in rows.values() if r["label"] == 1])
        fpr = np.mean([r[k] for r in rows.values() if r["label"] == 0])
        worst_pos = min((r[k], c) for c, r in rows.items() if r["label"] == 1)
        worst_neg = max((r[k], c) for c, r in rows.items() if r["label"] == 0)
        out[k] = dict(mean_TPR=tpr, mean_FPR=fpr, balanced_acc=0.5 * (tpr + 1 - fpr),
                      worst_positive=worst_pos, worst_negative=worst_neg)
    return out


if __name__ == "__main__":
    train, test = make(0), make(1)
    th = {k: best_threshold(train, k) for k in DETS}
    innocent = [d for d in train if d["case"] in ("competitive", "boom_parallel")]
    th_pf = dict(outcome=th["outcome"],
                 influence=float(np.quantile([d["influence"] for d in innocent], 0.95)),
                 talk=float(np.quantile([d["talk"] for d in innocent], 0.95)))
    aurocs = {k: float(roc_auc_score([d["label"] for d in test], [d[k] for d in test])) for k in DETS}
    rows = flag_table(test, th, th_pf)
    summ = summary(rows)
    pid = {}
    for c in ["cartel_talk", "cartel_tacit", "cartel_monitored"]:
        sub = [d for d in test if d["case"] == c]
        pid[c] = float(np.mean([tuple(d["pred_pair"]) == tuple(d["pair"]) for d in sub]))
    exp1 = dict(thresholds=th, plus_factor_thresholds=th_pf, auroc=aurocs,
                per_case_flag_rate=rows, summary=summ, pair_id_accuracy=pid)
    json.dump(exp1, open(f"{OUT}/exp1.json", "w"), indent=2, default=str)
    print("thresholds", th, "\npf", th_pf, "\nauroc", aurocs)
    for c, r in rows.items():
        print(f"{c:18s} {r['label']}   " + " ".join(f"{r[k]:6.3f}" for k in DETS + ['plus_factor']))
    print("pair id", pid)

    neg_cases = ["competitive", "boom_parallel"]
    negs = make(2, n=150, cases=neg_cases)
    def evasion_row(pos, **kw):
        allp = pos + negs; y = [d["label"] for d in allp]
        row = dict(kw, retained_markup=float(np.mean([d["retained"] for d in pos])))
        for k in ["outcome", "corr", "influence"]:
            row[f"auroc_{k}"] = float(roc_auc_score(y, [d[k] for d in allp]))
        row["influence_TPR_at5FPR"] = float(np.mean([d["influence"] > th_pf["influence"] for d in pos]))
        row["plus_factor_TPR"] = float(np.mean([plus_factor(d, th_pf) for d in pos]))
        row["plus_factor_FPR"] = float(np.mean([plus_factor(d, th_pf) for d in negs]))
        print({k: round(v, 3) for k, v in row.items()}); return row
    exp2 = dict(mask=[evasion_row(make(3, n=150, eps=e, cases=["cartel_tacit"]), eps=e)
                      for e in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]],
                jitter=[evasion_row(make(6, n=150, jitter=j, cases=["cartel_tacit"]), jitter=j)
                        for j in [0.0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2]])
    json.dump(exp2, open(f"{OUT}/exp2.json", "w"), indent=2)

    exp3 = []
    for jit in [0.0, 0.08]:
        for T in [10, 20, 30, 60, 120]:
            pos = make(4, n=150, jitter=jit, T=T, cases=["cartel_tacit"])
            neg = make(5, n=150, T=T, cases=neg_cases)
            allp = pos + neg; y = [d["label"] for d in allp]
            row = dict(jitter=jit, T=T, auroc_influence=float(roc_auc_score(y, [d["influence"] for d in allp])),
                       auroc_corr=float(roc_auc_score(y, [d["corr"] for d in allp])))
            exp3.append(row); print({k: round(v, 3) for k, v in row.items()})
    json.dump(exp3, open(f"{OUT}/exp3.json", "w"), indent=2)
