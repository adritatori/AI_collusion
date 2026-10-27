// Runs simulation and calibration off the main thread so the page stays responsive.
import { thresholdsFor, type Calibration } from './core/calibrate';
import { runPlayground, type PlaygroundParams, type PlaygroundResult } from './core/playground';

export type WorkerRequest =
  | { id: number; kind: 'playground'; params: PlaygroundParams }
  | { id: number; kind: 'calibrate'; T: number; N: number; withBenchmark: boolean; seed: number };

export type WorkerResponse =
  | { id: number; kind: 'playground'; result: PlaygroundResult }
  | { id: number; kind: 'calibrate'; result: Calibration }
  | { id: number; error: string };

const post = (m: WorkerResponse) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.kind === 'playground') post({ id: req.id, kind: 'playground', result: runPlayground(req.params) });
    else post({ id: req.id, kind: 'calibrate', result: thresholdsFor(req.T, req.N, req.seed, req.withBenchmark) });
  } catch (err) {
    post({ id: req.id, error: String(err) });
  }
};
