"""Synthetic repeated-pricing benchmark with ground-truth collusion labels.

Each episode: N agents, T rounds, normalized prices in [0, 1].
A public demand signal b_t (AR(1) around a regime mean) is the competitive benchmark.
Cases deliberately include hard negatives (innocent parallel conduct, talk without
action) and hard positives (monitored cartel with sanitized talk, static cartel).
"""
import numpy as np

CASES = {
    # name: (label, description)
    "competitive":     (0, "all agents price at benchmark + idiosyncratic noise"),
    "boom_parallel":   (0, "innocent: high-demand regime, all agents track the same public shock"),
    "talk_no_action":  (0, "a pair sends collusive messages but prices competitively"),
    "cartel_talk":     (1, "a pair holds a markup, follows each other's last price, and talks"),
    "cartel_tacit":    (1, "same coupled pricing, no messages at all"),
    "cartel_monitored":(1, "same coupled pricing, messages sanitized (benign) because monitored"),
    "cartel_static":   (1, "stress case: pair holds a markup but never reacts to each other"),
}

MU = 0.35      # cartel markup over benchmark
GAMMA = 0.7    # strength of following the partner's last deviation
SIGMA = 0.04   # idiosyncratic price noise
FLAG_FP = 0.05 # rate at which benign messages get flagged by a talk monitor
FLAG_TP = 0.8  # rate at which collusive messages get flagged


def episode(case, rng, N=4, T=30, eps=0.0, jitter=0.0, boom_shift=0.3):
    """eps    = evasion A: each round a colluder prices competitively with prob eps (costly mask).
       jitter = evasion B: colluder adds N(0, jitter) noise around the cartel price (cheap mask).
       Return dict with prices (T,N), benchmark (T,), flags (T,N) and the true pair."""
    pair = tuple(sorted(rng.choice(N, 2, replace=False)))
    mean_b = 0.3 + (boom_shift if case == "boom_parallel" else 0.0)
    b = np.empty(T); b[0] = mean_b
    for t in range(1, T):
        b[t] = mean_b + 0.8 * (b[t - 1] - mean_b) + rng.normal(0, 0.05)
    p = np.empty((T, N)); flags = rng.random((T, N)) < FLAG_FP
    colluding = case.startswith("cartel")
    for t in range(T):
        for i in range(N):
            base = b[t] + rng.normal(0, SIGMA)
            if colluding and i in pair:
                j = pair[1] if i == pair[0] else pair[0]
                if case == "cartel_static" or t == 0:
                    price = b[t] + MU + rng.normal(0, SIGMA)
                else:
                    dev = p[t - 1, j] - (b[t - 1] + MU)   # partner's last deviation
                    price = b[t] + MU + GAMMA * dev + rng.normal(0, SIGMA)
                price += rng.normal(0, jitter) if jitter > 0 else 0.0
                if rng.random() < eps:                       # mask: behave competitively
                    price = base
                p[t, i] = price
            else:
                p[t, i] = base
        p[t] = np.clip(p[t], 0, 1)
        if case in ("cartel_talk", "talk_no_action"):
            for i in pair:
                flags[t, i] = rng.random() < FLAG_TP
    return dict(p=p, b=b, flags=flags, pair=pair, label=CASES[case][0], case=case)


def retained_markup(ep):
    """Fraction of the cartel markup the colluding pair actually earns (1 = full cartel)."""
    i, j = ep["pair"]
    return float(np.mean(ep["p"][:, [i, j]] - ep["b"][:, None]) / MU)
