// Least-squares residual sum of squares via modified Gram-Schmidt (SPEC 4.6).
// Matches numpy.linalg.lstsq RSS on rank-deficient designs (e.g. a constant own-price column).

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k] * b[k];
  return s;
}

function project(v: Float64Array, basis: Float64Array[]): void {
  for (const q of basis) {
    const c = dot(q, v);
    for (let k = 0; k < v.length; k++) v[k] -= c * q[k];
  }
}

/** RSS of regressing y on the given columns (each column has y.length entries). */
export function rss(y: ArrayLike<number>, columns: ArrayLike<number>[]): number {
  const n = y.length;
  const basis: Float64Array[] = [];
  for (const col of columns) {
    const v = Float64Array.from(col);
    const orig = Math.sqrt(dot(v, v));
    project(v, basis);
    project(v, basis); // second pass: re-orthogonalise for stability
    const nv = Math.sqrt(dot(v, v));
    if (nv < 1e-10 * (orig + 1e-300)) continue; // column already in the span: skip
    for (let k = 0; k < n; k++) v[k] /= nv;
    basis.push(v);
  }
  const r = Float64Array.from(y);
  project(r, basis);
  project(r, basis);
  return dot(r, r);
}

/** Share of residual variance in y explained by `extra` after `base` (detectors._partial_r2). */
export function partialR2(y: ArrayLike<number>, base: ArrayLike<number>[], extra: ArrayLike<number>): number {
  const r0 = rss(y, base);
  const r1 = rss(y, [...base, extra]);
  return r0 < 1e-12 ? 0 : Math.max(0, 1 - r1 / r0);
}
