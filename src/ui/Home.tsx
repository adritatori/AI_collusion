export type Page = 'home' | 'audit' | 'playground' | 'test' | 'method';

export function Home({ go }: { go: (p: Page) => void }) {
  return (
    <section aria-labelledby="home-title">
      <h2 id="home-title">Start here</h2>

      <div className="hero">
        <p className="lead">Companies now let AI programs set prices. If the AI sellers quietly learn to keep prices high instead of competing, buyers pay more. Can anyone tell, just from the records?</p>
        <p>This tool shows what the records can and cannot prove.</p>
      </div>

      <h3>The idea in one picture</h3>
      <p>
        Picture four lemonade stands on one street. Normally they undercut each other, so lemonade stays cheap. Now suppose two stands
        secretly agree to charge $5. That is <b>collusion</b>. A regulator, or the company that owns the AI sellers, only sees the
        price history and the messages. This tool tests different ways of reading those records.
      </p>

      <h3>What do you want to do?</h3>
      <div className="cards">
        <button className="card" onClick={() => go('audit')}>
          <b>Check my own price logs</b>
          <span>Upload a CSV from your AI sellers (or any sellers). See what kind of evidence it contains and where the checks go blind.</span>
          <span className="who">For companies running AI pricing, auditors, regulators</span>
        </button>
        <button className="card" onClick={() => go('playground')}>
          <b>See how it works</b>
          <span>Build a fake market. Make some sellers cheat. Watch which checks catch them and which are fooled.</span>
          <span className="who">For anyone new to this</span>
        </button>
        <button className="card" onClick={() => go('test')}>
          <b>Test my own detector</b>
          <span>Download labelled fake markets, run your method, and compare its false alarms and misses with the paper's.</span>
          <span className="who">For researchers</span>
        </button>
      </div>

      <h3>Three things to know</h3>
      <ul className="plain">
        <li><b>High prices are not proof.</b> Prices rise for innocent reasons too, such as higher demand. A check that only looks at price is fooled.</li>
        <li><b>Every check fails somewhere.</b> The tool shows which one, so you know what the evidence can and cannot say.</li>
        <li><b>Silencing the talk does not lower prices.</b> In real AI-seller logs, cutting messages removed the evidence but not the high price.</li>
      </ul>

      <p className="hint">This tool never says "this is collusion". It shows evidence and the blind spots. It is not legal advice. Your data stays in your browser.</p>
      <p><button onClick={() => go('method')}>Read how it works and its limits</button></p>
    </section>
  );
}
