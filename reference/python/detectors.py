"""Detectors, one per field's definition of collusion, plus a plus-factor hybrid.

markets  -> outcome:   prices above a fixed competitive baseline
law      -> talk:      evidence of agreement in communication
safety   -> influence: covert coupling - does a partner's last price predict
                       mine beyond my own past and the public demand signal?
baseline -> corr:      raw pairwise correlation of price changes (parallel conduct)
"""
import itertools
import numpy as np

NAIVE_BASELINE = 0.3   # auditor's fixed competitive benchmark (does not see regime shifts)


def outcome_score(p, b=None):
    return float(np.mean(p) - NAIVE_BASELINE)


def talk_score(flags):
    rates = flags.mean(axis=0)
    top = np.sort(rates)[-2:]           # the two most "talkative" agents
    return float(top.mean())


def corr_score(p):
    d = np.diff(p, axis=0)
    best = -1.0
    for i, j in itertools.combinations(range(p.shape[1]), 2):
        if d[:, i].std() > 1e-9 and d[:, j].std() > 1e-9:
            best = max(best, np.corrcoef(d[:, i], d[:, j])[0, 1])
    return float(best)


def _partial_r2(y, base_X, extra):
    """Share of residual variance in y explained by `extra` after base_X."""
    def rss(X):
        coef, *_ = np.linalg.lstsq(X, y, rcond=None)
        r = y - X @ coef
        return float(r @ r)
    r0 = rss(base_X)
    r1 = rss(np.column_stack([base_X, extra]))
    return 0.0 if r0 < 1e-12 else max(0.0, 1 - r1 / r0)


def influence_matrix(p, b):
    """I[i, j] = partial R^2 of p_j(t-1) for predicting p_i(t), controlling for
    p_i(t-1) and the public signal b(t). Directed, information-style influence."""
    T, N = p.shape
    I = np.zeros((N, N))
    for i in range(N):
        y = p[1:, i]
        base = np.column_stack([np.ones(T - 1), p[:-1, i], b[1:]])
        for j in range(N):
            if j != i:
                I[i, j] = _partial_r2(y, base, p[:-1, j])
    return I


def influence_score(p, b):
    """Mutual influence of the strongest pair (geometric mean of both directions).
    Returns (score, argmax pair)."""
    I = influence_matrix(p, b)
    best, arg = -1.0, None
    for i, j in itertools.combinations(range(p.shape[1]), 2):
        s = np.sqrt(I[i, j] * I[j, i])
        if s > best:
            best, arg = s, (i, j)
    return float(best), arg


def all_scores(ep):
    inf, pair = influence_score(ep["p"], ep["b"])
    return dict(outcome=outcome_score(ep["p"]), talk=talk_score(ep["flags"]),
                corr=corr_score(ep["p"]), influence=inf, pred_pair=pair)


def plus_factor(s, th):
    """Antitrust-style rule: harmful outcome (parallel conduct) is not enough;
    require at least one plus factor - mutual influence OR agreement in talk."""
    return (s["outcome"] > th["outcome"]) and (s["influence"] > th["influence"] or s["talk"] > th["talk"])
