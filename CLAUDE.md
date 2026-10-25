# Instructions for Claude Code

You are building **Collusion Evidence Lab**, a static React + TypeScript site deployed to GitHub Pages or Vercel.

1. Read `SPEC.md` completely before writing code. It is the contract.
2. The Python in `reference/python/` is the source of truth for every formula. When the spec and the Python disagree, follow the Python and note the difference in the README.
3. Write the tests in SPEC section 9 first, using the fixtures in `fixtures/`. Do not loosen tolerances to make tests pass; fix the port instead.
4. Never add a verdict, a collusion probability, automatic message classification, or any network call that sends user data.
5. Any new decision logic, such as thresholds or new rules, must first be tested on simulated messy or adversarial data (see SPEC 5.3 for the pattern). Report the measured false-alarm rate in the PR description.
6. Build in this order:
   - (a) `core/` with parity tests passing;
   - (b) worker and calibration;
   - (c) Auditor;
   - (d) Playground;
   - (e) Method page;
   - (f) deploy workflow.

   Stop after each stage and summarize what passed and what did not.
7. Keep the UI copy plain and short. The audience includes regulators and non-programmers.
