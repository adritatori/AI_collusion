import { Playground } from './Playground';

export function App() {
  return (
    <>
      <header className="top">
        <div className="wrap">
          <h1>Collusion Evidence Lab</h1>
          <p className="sub">Simulate a pricing market. See which checks catch a cartel, and which they miss.</p>
        </div>
      </header>
      <main className="wrap">
        <Playground />
      </main>
      <footer className="wrap foot">
        Everything runs in your browser. Nothing is uploaded. This tool shows evidence. It does not give a verdict or legal advice.
      </footer>
    </>
  );
}
