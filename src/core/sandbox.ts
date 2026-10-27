// Runs a pasted detector function on every benchmark market inside a Web Worker made from a Blob.
// The worker removes network APIs before touching the user's code, the page's content-security-policy
// forbids connections, and the worker is terminated after a time limit.
import type { MarketInput } from './ownMethod';

export const SANDBOX_TIME_LIMIT_MS = 15_000;

/** Source for the worker. Kept as a string so it can run from a Blob with nothing imported. */
export const SANDBOX_SOURCE = `
'use strict';
for (const name of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','BroadcastChannel','indexedDB','caches','postMessageToParent']) {
  try { Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }); } catch (e) { try { self[name] = undefined; } catch (e2) {} }
}
self.onmessage = (e) => {
  const { code, markets } = e.data;
  let detect;
  try {
    detect = new Function('"use strict"; ' + code + '\\n; return (typeof detect === "function") ? detect : undefined;')();
  } catch (err) {
    self.postMessage({ error: 'Your code did not compile: ' + err.message });
    return;
  }
  if (typeof detect !== 'function') { self.postMessage({ error: 'Define a function named detect(market). It must return true or false (or 1 or 0).' }); return; }
  const flags = [];
  for (let i = 0; i < markets.length; i++) {
    let out;
    try { out = detect(markets[i]); } catch (err) { self.postMessage({ error: 'Your function threw on market ' + (i + 1) + ': ' + err.message }); return; }
    if (out === true || out === 1) flags.push(1);
    else if (out === false || out === 0) flags.push(0);
    else { self.postMessage({ error: 'Market ' + (i + 1) + ': detect must return true, false, 1 or 0, got ' + (typeof out) + '.' }); return; }
  }
  self.postMessage({ flags });
};
`;

export const EXAMPLE_DETECTOR = `// market = { prices, benchmark, flags, rounds, sellers }
// prices[t][i] is seller i's price in round t. Return true to flag the market.
function detect(market) {
  const all = market.prices.flat();
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  return mean - 0.3 > 0.0857; // "price level" check from the paper
}`;

export type SandboxResult = { flags: number[] } | { error: string };

export function runInSandbox(code: string, markets: MarketInput[], timeoutMs = SANDBOX_TIME_LIMIT_MS): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([SANDBOX_SOURCE], { type: 'text/javascript' }));
    const w = new Worker(url);
    const done = (r: SandboxResult) => { clearTimeout(timer); w.terminate(); URL.revokeObjectURL(url); resolve(r); };
    const timer = setTimeout(() => done({ error: `Your function took longer than ${timeoutMs / 1000} seconds and was stopped. Is there an endless loop?` }), timeoutMs);
    w.onmessage = (e: MessageEvent<SandboxResult>) => done(e.data);
    w.onerror = (e) => done({ error: `Worker error: ${e.message}` });
    w.postMessage({ code, markets });
  });
}
