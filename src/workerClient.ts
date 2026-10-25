// Promise wrapper around the worker. One shared worker; requests are matched by id.
import type { Request, Response } from './workerApi';
import Worker from './worker?worker';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (r: Response) => void; reject: (e: Error) => void }>();

function get(): Worker {
  if (!worker) {
    worker = new Worker();
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; res?: Response; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.res!);
      else p.reject(new Error(e.data.error));
    };
  }
  return worker;
}

export function run(req: Request): Promise<Response> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    get().postMessage({ id, req });
  });
}
