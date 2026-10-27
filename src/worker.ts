// Runs simulation and calibration off the main thread so sliders stay responsive.
import { runPlayground, type PlaygroundParams, type PlaygroundResult } from './core/playground';

export type WorkerRequest = { id: number; params: PlaygroundParams };
export type WorkerResponse = { id: number; result?: PlaygroundResult; error?: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, params } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, result: runPlayground(params) } satisfies WorkerResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies WorkerResponse);
  }
};
