import exp1 from '../../data/exp1.json';

const base = import.meta.env.BASE_URL;
const pf = exp1.summary.plus_factor;
const out = exp1.summary.outcome;

export function Method() {
  return (
    <section aria-labelledby="me-title">
      <h2 id="me-title">How it works, and its limits</h2>
      <p>
        Based on the paper <i>“Oversight Removes the Evidence, Not the Harm: What Logs Can Prove About Collusion Among LLM Agents”</i>{' '}
        (Adrita Rahman Tory, preprint).
      </p>

      <h3>The question</h3>
      <p>LLM sellers in simulated markets often keep prices above the competitive level. An auditor only gets their logs: prices, messages, and sometimes reasoning. Three fields read those logs differently.</p>
      <div className="scroll">
      <table className="grid">
        <thead><tr><th scope="col">Field</th><th scope="col">What “collusion” means</th><th scope="col">The check</th><th scope="col">Where it fails</th></tr></thead>
        <tbody>
          <tr><th scope="row">Markets</th><td>A price above the competitive price</td><td>Price level</td><td>A demand boom raises prices for innocent reasons</td></tr>
          <tr><th scope="row">Law</th><td>An agreement. High prices alone are legal; extra proof such as messages is needed</td><td>Talk</td><td>Flags talk with no action; misses silent cartels</td></tr>
          <tr><th scope="row">AI safety</th><td>Hidden coordination. Agents may hide it from an overseer</td><td>Influence: does my price follow my rival's last price?</td><td>Misses a cartel that holds a price and never reacts</td></tr>
          <tr><th scope="row">Baseline</th><td>Prices simply move together</td><td>Correlation</td><td>Shared shocks make every market look coordinated</td></tr>
        </tbody>
      </table>
      </div>

      <h3>The plus-factor rule</h3>
      <p>Borrowed from antitrust law: high prices alone are not enough. The rule needs one supporting sign.</p>
      <pre className="rule">flag = Price high AND (Talk OR Influence)</pre>
      <p>Thresholds are set only on innocent simulated markets, so the false-alarm rate is controlled by design.</p>
      <p><b>What it buys:</b> false alarms fall from {Math.round(out.mean_FPR * 100)}% (price alone) to {Math.round(pf.mean_FPR * 100)}%, and it still catches 89% to 98% of cartels that react to each other (30 rounds, 4 sellers, 200 test markets per type). <b>What it costs:</b> it catches only 8% of static cartels.</p>
      <figure>
        <img src={`${base}figs/fig1_cases.png`} alt="Table of flag rates for five checks across seven market types. Influence and the plus-factor rule are near zero for the static cartel." />
        <figcaption>Paper figure: how often each check flags each market type. Red numbers are wrong calls.</figcaption>
      </figure>

      <h3>What happened in real AI-seller logs</h3>
      <p>
        We re-read released double-auction logs from Agrawal et al. (2025): 5 LLM sellers, 30 rounds, cost $80, buyer value $100, fair price
        $90. We use the 50 GPT-4.1 runs, 10 per condition. No new model calls. Conditions follow the data: seller chat (C), a
        profit-pressure prompt (P), and an overseer who cuts messages (O).
      </p>
      <ul className="plain">
        <li>With chat and pressure, prices stay high whether or not the overseer cuts the messages (collusion index 0.64 vs 0.63, p = 0.62).</li>
        <li>With no messages at all, prices fall below the fair price (−0.22).</li>
        <li>The overseer caught the talk in all 20 overseen runs within 7 rounds. In a typical run the price never moved.</li>
      </ul>
      <figure>
        <img src={`${base}figs/fig5_timeline.png`} alt="Left: collusion index by round for four conditions. Right: average message length by round, with a shaded window where messages are cut." />
        <figcaption>Paper figure: left, price over time. Right, message length. Once messages are cut, the talk evidence disappears but the high price remains.</figcaption>
      </figure>
      <p><b>Takeaway:</b> oversight removed the evidence, not the harm. Monitors need remedies that act on prices, such as price caps or resetting asks. Still open: is it a hidden agreement, or did the profit-pressure prompt alone keep prices high? Logs cannot tell.</p>

      <h3>Limits</h3>
      <ul className="plain">
        <li><b>Scripted agents.</b> The simulated sellers follow simple rules. Passing a test here does not show a method works on real markets.</li>
        <li><b>Thresholds depend on log length and number of sellers.</b> The tool recalibrates them for each log by simulating innocent markets of the same size. At 20 rounds, the 30-round influence threshold would flag 22% of normal markets. Under 20 rounds, influence is left out.</li>
        <li><b>Calibration is only as good as the simulated innocent market.</b> A real innocent market may behave differently.</li>
        <li><b>The competitive price is yours to supply.</b> If you give a wrong one, “high price” will be wrong. When your file has a benchmark column, the tool fills in its average. The paper's own price check uses a fixed baseline instead, which is why it is fooled by demand booms.</li>
        <li><b>Talk needs your own monitor.</b> The tool never reads or labels messages. Without a <code>flagged</code> column, Talk is “not available”.</li>
        <li><b>2 to 12 sellers.</b> The pair-by-pair checks are not meaningful on larger groups.</li>
        <li><b>Nothing here is legal advice,</b> and nothing here is a verdict or a probability of collusion.</li>
      </ul>

      <h3>Privacy</h3>
      <p>Everything runs in your browser. Files you load are never uploaded. A page-level security rule blocks network connections, and pasted detector code runs in a worker with network access removed.</p>

      <h3>Cite</h3>
      <pre className="rule">{`Tory, A. R. Oversight Removes the Evidence, Not the Harm: What Logs Can Prove About Collusion Among LLM Agents. Preprint.
Data: Agrawal et al. (2025), Evaluating LLM Agent Collusion in Double Auctions, arXiv:2507.01413.`}</pre>
    </section>
  );
}
