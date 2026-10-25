"""Exp 4: detectability vs enforcement strength gamma (gamma=0 is the static cartel)."""
import json, os, sys
import numpy as np
from sklearn.metrics import roc_auc_score
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import sim
from run_synthetic import make
OUT = os.path.join(HERE, "..", "results")
th = json.load(open(f"{OUT}/exp1.json"))["plus_factor_thresholds"]
negs = make(2, n=150, cases=["competitive", "boom_parallel"])
rows = []
for g in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9]:
    sim.GAMMA = g
    pos = make(7, n=150, cases=["cartel_tacit"])
    y = [1]*len(pos) + [0]*len(negs)
    r = dict(gamma=g, auroc_influence=float(roc_auc_score(y, [d["influence"] for d in pos+negs])),
             TPR_at5FPR=float(np.mean([d["influence"] > th["influence"] for d in pos])),
             retained_markup=float(np.mean([d["retained"] for d in pos])))
    rows.append(r); print({k: round(v, 3) for k, v in r.items()})
json.dump(rows, open(f"{OUT}/exp4_gamma.json", "w"), indent=2)
