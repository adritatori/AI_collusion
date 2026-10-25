# Calibration stress test

## 1. Clean synthetic data: frozen vs calibrated thresholds

5 replicates × 300 fresh episodes per case. FA = false-alarm rate. "range" = single-replicate min–max.

| T | N | Comp. influence FA (frozen) | Comp. influence FA (calibrated) | range | Boom plus-factor FA (frozen) | Boom plus-factor FA (calibrated) | Tacit influence detect (cal.) | Tacit plus-factor detect (cal.) |
|---|---|---|---|---|---|---|---|---|
| 8 | 2 | 0.475 | 0.051 | 0.037–0.077 | 0.561 | 0.106 | 0.213 | 0.241 |
| 10 | 2 | 0.313 | 0.059 | 0.050–0.080 | 0.355 | 0.075 | 0.327 | 0.343 |
| 15 | 2 | 0.118 | 0.045 | 0.007–0.073 | 0.165 | 0.075 | 0.617 | 0.628 |
| 20 | 2 | 0.047 | 0.040 | 0.023–0.067 | 0.105 | 0.095 | 0.820 | 0.829 |
| 25 | 2 | 0.027 | 0.063 | 0.057–0.083 | 0.068 | 0.098 | 0.918 | 0.921 |
| 30 | 2 | 0.010 | 0.052 | 0.027–0.080 | 0.024 | 0.073 | 0.967 | 0.968 |
| 60 | 2 | 0.000 | 0.052 | 0.050–0.057 | 0.001 | 0.089 | 1.000 | 1.000 |
| 8 | 4 | 0.967 | 0.056 | 0.047–0.070 | 0.985 | 0.089 | 0.107 | 0.131 |
| 10 | 4 | 0.877 | 0.053 | 0.037–0.070 | 0.894 | 0.079 | 0.181 | 0.192 |
| 15 | 4 | 0.534 | 0.055 | 0.043–0.073 | 0.620 | 0.069 | 0.426 | 0.429 |
| 20 | 4 | 0.269 | 0.042 | 0.033–0.053 | 0.372 | 0.088 | 0.671 | 0.671 |
| 25 | 4 | 0.101 | 0.046 | 0.023–0.063 | 0.237 | 0.089 | 0.827 | 0.820 |
| 30 | 4 | 0.049 | 0.042 | 0.033–0.047 | 0.094 | 0.091 | 0.905 | 0.900 |
| 60 | 4 | 0.001 | 0.052 | 0.027–0.080 | 0.006 | 0.089 | 1.000 | 0.999 |
| 8 | 8 | 1.000 | 0.057 | 0.023–0.077 | 1.000 | 0.073 | 0.061 | 0.041 |
| 10 | 8 | 1.000 | 0.050 | 0.033–0.070 | 1.000 | 0.105 | 0.105 | 0.075 |
| 15 | 8 | 0.951 | 0.056 | 0.037–0.077 | 0.982 | 0.073 | 0.291 | 0.165 |
| 20 | 8 | 0.721 | 0.052 | 0.043–0.063 | 0.843 | 0.077 | 0.525 | 0.285 |
| 25 | 8 | 0.423 | 0.051 | 0.043–0.060 | 0.643 | 0.093 | 0.677 | 0.347 |
| 30 | 8 | 0.236 | 0.045 | 0.037–0.060 | 0.337 | 0.065 | 0.801 | 0.422 |
| 60 | 8 | 0.002 | 0.055 | 0.040–0.070 | 0.024 | 0.087 | 0.999 | 0.528 |

## 2. Messy data the calibration model does not include (calibrated thresholds)

| T | Condition | Comp. influence FA | range | Boom plus-factor FA | Tacit influence detect | Tacit plus-factor detect |
|---|---|---|---|---|---|---|
| 20 | clean | 0.042 | 0.033–0.053 | 0.088 | 0.671 | 0.671 |
| 20 | heavy-tailed noise (t3 × 0.02) | 0.052 | 0.037–0.067 | 0.093 | 0.372 | 0.385 |
| 20 | hidden common demand shock | 0.089 | 0.077–0.107 | 0.141 | 0.631 | 0.618 |
| 20 | sticky pricing (half-way moves) | 0.085 | 0.060–0.127 | 0.115 | 0.659 | 0.663 |
| 20 | coarse price grid (0.05) | 0.052 | 0.030–0.067 | 0.091 | 0.574 | 0.581 |
| 30 | clean | 0.042 | 0.033–0.047 | 0.091 | 0.905 | 0.900 |
| 30 | heavy-tailed noise (t3 × 0.02) | 0.051 | 0.030–0.073 | 0.104 | 0.595 | 0.603 |
| 30 | hidden common demand shock | 0.092 | 0.067–0.113 | 0.143 | 0.883 | 0.857 |
| 30 | sticky pricing (half-way moves) | 0.073 | 0.063–0.093 | 0.112 | 0.850 | 0.847 |
| 30 | coarse price grid (0.05) | 0.047 | 0.033–0.077 | 0.091 | 0.853 | 0.851 |

## 3. Missing prices: calibration without vs with the missing-row mask (T=30, N=4)

Random: one accepted mask per replicate, used for calibration and for all its test episodes.
Adversarial: rows hidden right after the partner's largest deviations; the mask differs per episode, so each test episode is calibrated on its own mask (60 per case).

| Missing rows | Calibration | Comp. influence FA | Boom plus-factor FA | Tacit influence detect | Tacit plus-factor detect |
|---|---|---|---|---|---|
| random 5% | no mask | 0.073 | 0.115 | 0.906 | 0.901 |
| random 5% | with mask | 0.046 | 0.088 | 0.875 | 0.872 |
| random 10% | no mask | 0.209 | 0.254 | 0.888 | 0.881 |
| random 10% | with mask | 0.051 | 0.092 | 0.747 | 0.747 |
| random 20% | no mask | 0.264 | 0.307 | 0.883 | 0.879 |
| random 20% | with mask | 0.049 | 0.064 | 0.658 | 0.663 |
| adversarial 3/colluder | no mask | 0.033 | 0.050 | 0.667 | 0.700 |
| adversarial 3/colluder | with mask | 0.017 | 0.033 | 0.667 | 0.700 |
| adversarial 6/colluder | no mask | 0.150 | 0.183 | 0.650 | 0.683 |
| adversarial 6/colluder | with mask | 0.017 | 0.033 | 0.317 | 0.383 |
