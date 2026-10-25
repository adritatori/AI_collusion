// Runs simulation and calibration off the main thread.
import { handle, type Request } from './workerApi';

self.onmessage = (e: MessageEvent<{ id: number; req: Request }>) => {
  try {
    self.postMessage({ id: e.data.id, ok: true, res: handle(e.data.req) });
  } catch (err) {
    self.postMessage({ id: e.data.id, ok: false, error: String(err) });
  }
};
