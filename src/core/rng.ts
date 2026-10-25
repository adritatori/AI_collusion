// Seeded RNG: mulberry32 for uniforms, Box-Muller for normals.
// The stream differs from NumPy's, so tests on simulated data compare distributions, not values.

export interface Rng {
  random(): number;
  normal(mean?: number, sd?: number): number;
  /** Two distinct indices from 0..n-1, sorted ascending (like sorted(rng.choice(n, 2, replace=False))). */
  pair(n: number): [number, number];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: number): Rng {
  const u = mulberry32(seed);
  let spare: number | null = null;
  const stdNormal = (): number => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u1 = u();
    while (u1 <= 0) u1 = u();
    const u2 = u();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  };
  return {
    random: u,
    normal: (mean = 0, sd = 1) => mean + sd * stdNormal(),
    pair: (n: number) => {
      const a = Math.floor(u() * n);
      let b = Math.floor(u() * (n - 1));
      if (b >= a) b += 1;
      return a < b ? [a, b] : [b, a];
    },
  };
}
