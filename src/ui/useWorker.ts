import { useEffect, useRef } from 'react';
import ComputeWorker from '../worker?worker';
import type { WorkerRequest, WorkerResponse } from '../worker';

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;

/** One background worker per page; each call resolves with the reply to that call only. */
export function useWorker() {
  const w = useRef<Worker | null>(null);
  const next = useRef(0);
  const pending = useRef(new Map<number, { ok: (r: WorkerResponse) => void; fail: (e: string) => void }>());
  useEffect(() => {
    const worker = new ComputeWorker();
    w.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = pending.current.get(e.data.id);
      if (!p) return;
      pending.current.delete(e.data.id);
      if ('error' in e.data) p.fail(e.data.error);
      else p.ok(e.data);
    };
    return () => { worker.terminate(); pending.current.clear(); };
  }, []);
  return {
    call<K extends WorkerRequest['kind']>(req: Distribute<Extract<WorkerRequest, { kind: K }>>): Promise<Extract<WorkerResponse, { kind: K }>> {
      return new Promise((ok, fail) => {
        const id = ++next.current;
        pending.current.set(id, { ok: ok as (r: WorkerResponse) => void, fail });
        w.current?.postMessage({ ...req, id } as WorkerRequest);
      });
    },
  };
}
