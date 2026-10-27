import { useEffect, useState } from 'react';
import { Audit } from './Audit';
import { Home, type Page } from './Home';
import { Method } from './Method';
import { Playground } from './Playground';
import { TestMethod } from './TestMethod';

const TABS: { id: Page; label: string }[] = [
  { id: 'home', label: 'Start here' },
  { id: 'audit', label: 'Check my logs' },
  { id: 'playground', label: 'Playground' },
  { id: 'test', label: 'Test my detector' },
  { id: 'method', label: 'Method' },
];

const fromHash = (): Page => {
  const h = window.location.hash.replace(/^#\/?/, '') as Page;
  return TABS.some((t) => t.id === h) ? h : 'home';
};

export function App() {
  const [page, setPage] = useState<Page>(fromHash);
  useEffect(() => {
    const on = () => setPage(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (p: Page) => {
    window.location.hash = `/${p}`;
    setPage(p);
    window.scrollTo(0, 0);
  };
  return (
    <>
      <header className="top">
        <div className="wrap">
          <h1>Collusion Evidence Lab</h1>
          <p className="sub">What can price logs from AI sellers prove about collusion?</p>
          <nav aria-label="Pages" className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${page === t.id ? 'on' : ''}`} aria-current={page === t.id ? 'page' : undefined} onClick={() => go(t.id)}>{t.label}</button>
            ))}
          </nav>
        </div>
      </header>
      <main className="wrap">
        {page === 'home' && <Home go={go} />}
        {page === 'audit' && <Audit />}
        {page === 'playground' && <Playground />}
        {page === 'test' && <TestMethod />}
        {page === 'method' && <Method />}
      </main>
      <footer className="wrap foot">
        Everything runs in your browser. Nothing is uploaded. This tool shows evidence. It does not give a verdict or legal advice.
      </footer>
    </>
  );
}
