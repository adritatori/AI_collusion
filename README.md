# Collusion Evidence Lab

A static browser tool built from the paper *"Oversight Removes the Evidence, Not the Harm: What Logs Can Prove About Collusion Among LLM Agents"* (Adrita Rahman Tory, preprint).

**Your data never leaves your browser.** There is no server, no account and no analytics.

> Work in progress. Built in stages (see `CLAUDE.md`). Done so far: (a) `src/core` with parity tests, (b) worker and calibration.

## Run and test

```
npm install
npm test          # unit, parity and statistical tests
npm run stress    # stress tests on simulated messy data; writes reports/*.md
```

## Where this port differs from the spec or the Python

The Python in `reference/python/` is the source of truth. Differences:

1. **Statistical parity test (SPEC 6.3) changed.** `data/exp1.json` is one 200-episode sample per case and sits up to ~0.05 from the long-run rates, so a ±0.06 check at 200 episodes fails for a correct port on most seeds (measured: 12 of 20). The test now compares JS at 2,000 episodes per case with a 4,000-episode Python reference (`fixtures/statistical_reference.json`, made by `reference/python/make_statistical_reference.py`). The tolerance per cell is 3 standard errors of the difference, using the pooled binomial rate. `exp1.json` is used only for the paper's reported numbers.
2. **`msg_len` real-log parity is checked on 1 of 5 runs.** `fixtures/real_parity.json` has per-round means rounded to 2 decimals, not the raw messages. The one run whose messages ship as `samples/real_pressure_oversight_run2.csv` matches within 1e-6. The formula is a mean of character counts (Unicode code points, as Python's `len`) over non-empty messages.
3. **Missing prices (new logic, not in the Python).** The Python pairwise detectors assume complete logs. Here a missing price drops only what it touches: outcome skips that cell; influence and correlation drop the regression rows or price changes that need it. With no missing prices the results equal the Python exactly. An agent missing more than 20% of rounds is still an error in pairwise mode. Stress-test results are in `reports/missingness.md` and `reports/calibration.md`.
4. **Calibration with missing prices (new logic).** Dropped rows inflate influence the way a shorter log does, so when a log has missing prices the calibration applies the log's own missing-row pattern to every simulated episode. See `reports/calibration.md`.
5. **Playground simulator options.** `demandShift` (applies to every case) and a talk-mode override were added to `sim.ts`. Their defaults reproduce the Python exactly (tested).
