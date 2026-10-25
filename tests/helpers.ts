import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(__dirname, '..');

/** Read a JSON file written by Python, which may contain bare NaN tokens. */
export function loadJson<T = any>(rel: string): T {
  const txt = readFileSync(resolve(ROOT, rel), 'utf8').replace(/([\[,:]\s*)NaN(?=\s*[,\]}])/g, '$1"__NaN__"');
  return JSON.parse(txt, (_k, v) => (v === '__NaN__' ? NaN : v));
}

export function readText(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}
