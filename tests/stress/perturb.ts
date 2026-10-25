// Messy / adversarial departures from the synthetic model, applied to test episodes only.
// Calibration never sees these, so they measure what happens when the innocent model is wrong.
import type { Matrix } from '../../src/core/detectors';
import type { Rng } from '../../src/core/rng';
import type { Episode } from '../../src/core/sim';

const clip = (x: number) => Math.min(1, Math.max(0, x));

/** Student-t (df=3) noise scaled by s: occasional large price spikes. */
export function heavyTails(ep: Episode, rng: Rng, s = 0.02): Matrix {
  const t3 = () => { const z = rng.normal(); let c = 0; for (let k = 0; k < 3; k++) c += rng.normal() ** 2; return z / Math.sqrt(c / 3); };
  return ep.p.map((row) => row.map((x) => clip(x + s * t3())));
}

/** A persistent demand shock that all agents see but the benchmark column does not. */
export function hiddenCommonShock(ep: Episode, rng: Rng, rho = 0.8, sd = 0.03): Matrix {
  let z = 0;
  return ep.p.map((row) => { z = rho * z + rng.normal(0, sd); return row.map((x) => clip(x + z)); });
}

/** Sticky pricing: each agent moves only halfway to its new price each round. */
export function sticky(ep: Episode, _rng: Rng, w = 0.5): Matrix {
  const out = ep.p.map((r) => [...r]);
  for (let t = 1; t < out.length; t++) for (let i = 0; i < out[t].length; i++) out[t][i] = w * out[t - 1][i] + (1 - w) * ep.p[t][i];
  return out;
}

/** Prices on a coarse grid (0.05), as with whole-cent or tick prices. */
export function coarseGrid(ep: Episode, _rng: Rng, step = 0.05): Matrix {
  return ep.p.map((row) => row.map((x) => Math.round(x / step) * step));
}
