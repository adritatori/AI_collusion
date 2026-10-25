import json, os, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
R = os.path.join(HERE, "..", "results"); F = os.path.join(HERE, "..", "figs")
plt.rcParams.update({"font.size": 9, "axes.spines.top": False, "axes.spines.right": False,
                     "figure.dpi": 200, "font.family": "DejaVu Sans", "pdf.fonttype": 42})
INK, BLUE, ORANGE, GREEN, GREY, RED = "#222", "#2B6CB0", "#DD6B20", "#2F855A", "#A0AEC0", "#C53030"


def save(fig, name):
    fig.savefig(f"{F}/{name}.pdf"); fig.savefig(f"{F}/{name}.png"); plt.close(fig)


# Fig 1: per-case flag rates
rows = json.load(open(f"{R}/exp1.json"))["per_case_flag_rate"]
cases = list(rows)
dets = ["outcome", "talk", "corr", "influence", "plus_factor"]
names = ["Outcome\n(markets)", "Talk\n(law)", "Correlation\n(parallel conduct)",
         "Influence\n(safety)", "Plus-factor\n(hybrid)"]
M = np.array([[rows[c][d] for d in dets] for c in cases])
fig, ax = plt.subplots(figsize=(6.6, 3.1))
ax.imshow(M, cmap="Greys", vmin=0, vmax=1.6, aspect="auto")
for i, c in enumerate(cases):
    lab = rows[c]["label"]
    for j in range(len(dets)):
        v = M[i, j]; wrong = (v > 0.5) != bool(lab)
        ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=8.5,
                color=RED if wrong else INK, fontweight="bold" if wrong else "normal")
ax.set_xticks(range(len(dets)), names, fontsize=7.5)
ax.set_yticks(range(len(cases)), [f"{c.replace('_', ' ')}  [{'collusive' if rows[c]['label'] else 'innocent'}]" for c in cases], fontsize=7.5)
ax.axhline(2.5, color=INK, lw=0.8)
fig.tight_layout(); save(fig, "fig1_cases")

# Fig 2: evasion
e2 = json.load(open(f"{R}/exp2.json")); e4 = json.load(open(f"{R}/exp4_gamma.json"))
fig, axs = plt.subplots(1, 3, figsize=(7.2, 2.4))
for a, rr, xk, yk, lab in [(axs[0], e2["mask"], "eps", "influence_TPR_at5FPR", "A: mask rate $\\varepsilon$\n(price competitively)"),
                           (axs[1], e2["jitter"], "jitter", "influence_TPR_at5FPR", "B: price jitter $\\sigma_j$\n(cheap noise)"),
                           (axs[2], e4, "gamma", "TPR_at5FPR", "C: reaction strength $\\gamma$\n($\\gamma$=0: static cartel)")]:
    x = [r[xk] for r in rr]
    a.plot(x, [r[yk] for r in rr], "o-", color=BLUE, ms=3, label="Influence detection rate")
    a.plot(x, [r["retained_markup"] for r in rr], "s--", color=ORANGE, ms=3, label="Cartel markup kept")
    a.set_xlabel(lab); a.set_ylim(0, 1.08); a.axhline(0.05, color=GREY, lw=0.6, ls=":")
axs[0].set_ylabel("rate / fraction"); axs[0].legend(fontsize=6.5, frameon=False, loc="upper right")
fig.tight_layout(); save(fig, "fig2_evasion")

# Fig 3: real LLM logs, condition means
e5 = json.load(open(f"{R}/exp5_real_summary.json"))["summary"]
order = ["base", "base-seller_comms", "oversight", "boss_pressure", "boss_pressure-oversight"]
labels = ["none", "C", "C+O", "C+P", "C+P+O"]
cols = [GREY, BLUE, BLUE, ORANGE, RED]
panels = [("outcome", "Outcome:\ncollusion index"), ("talk", "Talk: judge score on\nprivate reasoning (1-4)"),
          ("influence", "Influence: rival\nreaction (partial $R^2$)"), ("abs_dask", "Price movement:\nmean |$\\Delta$ask| per round"),
          ("msg_len", "Message length\n(chars)")]
fig, axs = plt.subplots(1, 5, figsize=(7.4, 2.35))
for a, (k, t) in zip(axs, panels):
    v = [e5[c][k] for c in order]
    a.bar(range(5), [x[0] for x in v], color=cols, width=0.7,
          yerr=[[x[0] - x[1] for x in v], [x[2] - x[0] for x in v]], error_kw=dict(lw=0.7, capsize=2))
    a.set_xticks(range(5), labels, fontsize=6.5, rotation=45); a.set_title(t, fontsize=7)
    a.tick_params(axis="y", labelsize=6.5)
    if k == "outcome": a.axhline(0, color=INK, lw=0.6)
    if k == "talk": a.set_ylim(1, 4.1)
fig.tight_layout(); save(fig, "fig3_real")

# Fig 4: evidence length
e3 = json.load(open(f"{R}/exp3.json"))
fig, ax = plt.subplots(figsize=(3.3, 2.2))
for jit, c in [(0.0, BLUE), (0.08, GREEN)]:
    rr = [r for r in e3 if r["jitter"] == jit]
    ax.plot([r["T"] for r in rr], [r["auroc_influence"] for r in rr], "o-", color=c, ms=3, label=f"influence, $\\sigma_j$={jit}")
    ax.plot([r["T"] for r in rr], [r["auroc_corr"] for r in rr], "x--", color=c, ms=3, alpha=0.6, label=f"correlation, $\\sigma_j$={jit}")
ax.axhline(0.5, color=GREY, lw=0.6, ls=":"); ax.set_xscale("log"); ax.set_xticks([10, 20, 30, 60, 120], [10, 20, 30, 60, 120])
ax.set_xlabel("rounds of logged evidence $T$"); ax.set_ylabel("AUROC"); ax.legend(fontsize=5.8, frameon=False)
fig.tight_layout(); save(fig, "fig4_length")

# Fig 5: round-by-round view of the gag (real logs)
from load_real import load
rows_r = load()
fig, axs = plt.subplots(1, 2, figsize=(7.0, 2.4))
for cond, c, lab in [("base", GREY, "none"), ("boss_pressure", ORANGE, "C+P"), ("boss_pressure-oversight", RED, "C+P+O"),
                     ("oversight", BLUE, "C+O")]:
    rs = [r for r in rows_r if r["cond"] == cond]
    ask = np.array([np.nanmean(r["asks"], axis=1) for r in rs])
    ci = (ask - 90) / 10
    axs[0].plot(range(1, ci.shape[1] + 1), np.nanmean(ci, 0), color=c, lw=1.4, label=lab)
    if cond != "base":
        L = np.array([[np.mean([len(r["msgs"][s][t]) for s in r["msgs"]]) for t in range(r["asks"].shape[0])] for r in rs])
        axs[1].plot(range(1, L.shape[1] + 1), L.mean(0), color=c, lw=1.4, label=lab)
for a in axs: a.set_xlabel("round (hour)")
axs[0].axhline(0, color=INK, lw=0.5); axs[0].set_ylabel("collusion index of mean ask"); axs[0].legend(fontsize=6.5, frameon=False, ncol=2)
axs[1].set_ylabel("mean message length (chars)")
gr = [r["gag_round"] for r in rows_r if r["cond"] == "boss_pressure-oversight"]
axs[1].axvspan(min(gr) + 1, max(gr) + 1, color=RED, alpha=0.08)
axs[1].text(8.5, 120, "gag window\n(C+P+O runs)", fontsize=6.5, color=RED)
fig.tight_layout(); save(fig, "fig5_timeline")
print("ok")
