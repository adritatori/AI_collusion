# Missing-price stress test

1000 episodes per case and condition, T=30, N=4, frozen thresholds (influence 0.1371).
Episodes the parser would reject (an agent missing >20% of rounds) are excluded; the share is shown.
Influence here uses the plus-factor threshold (the 5% false-alarm level).

| Condition | Rejected | Competitive influence FA | Competitive plus-factor FA | Boom plus-factor FA | Boom influence FA | Cartel_tacit influence detect | Cartel_tacit plus-factor detect |
|---|---|---|---|---|---|---|---|
| complete | 0.000 / 0.000 / 0.000 | 0.056 | 0.000 | 0.087 | 0.046 | 0.895 | 0.889 |
| random 5% | 0.002 / 0.002 / 0.002 | 0.123 | 0.002 | 0.148 | 0.109 | 0.873 | 0.866 |
| random 10% | 0.085 / 0.085 / 0.085 | 0.216 | 0.002 | 0.242 | 0.205 | 0.875 | 0.867 |
| random 20% | 0.873 / 0.873 / 0.873 | 0.299 | 0.008 | 0.331 | 0.323 | 0.898 | 0.898 |
| adversarial 3 rounds/colluder (10%) | 0.000 / 0.000 / 0.000 | 0.116 | 0.000 | 0.151 | 0.114 | 0.706 | 0.703 |
| adversarial 6 rounds/colluder (20%, the most the parser allows) | 0.000 / 0.000 / 0.000 | 0.241 | 0.002 | 0.286 | 0.252 | 0.612 | 0.600 |

Rejected column: competitive / boom / cartel_tacit.
