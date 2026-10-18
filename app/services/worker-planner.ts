import { PlanningFailure } from '../domain/planner'
import type { PlanningFailureCode, PlanningRequest, PlanningResult, PlanningService } from '../domain/planner'

export type WorkerRequest =
  | { type: 'init'; manifestUrl: string }
  | { type: 'execute'; id: number; request: PlanningRequest }
  | { type: 'cancel'; id: number }
export type WorkerResponse =
  | { id: number; result: PlanningResult }
  | { id: number; error: { code: PlanningFailureCode; message: string } }

/** Runs the routing engine in a module worker over the static regional graph snapshots. */
export function createWorkerPlanner(manifestUrl: string): PlanningService {
  let worker: Worker | null = null
  let counter = 0
  const pending = new Map<number, { resolve: (result: PlanningResult) => void; reject: (error: Error) => void }>()
  function start() {
    if (worker) return worker
    const created = new Worker(new URL('../workers/planner.worker.ts', import.meta.url), { type: 'module' })
    created.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data, job = pending.get(message.id)
      if (!job) return
      pending.delete(message.id)
      if ('result' in message) job.resolve(message.result)
      else job.reject(new PlanningFailure(message.error.code, message.error.message))
    }
    created.onerror = () => {
      for (const job of pending.values()) job.reject(new PlanningFailure('unavailable', "Can't load routes right now."))
      pending.clear(); worker = null; created.terminate()
    }
    created.postMessage({ type: 'init', manifestUrl: new URL(manifestUrl, window.location.href).href } satisfies WorkerRequest)
    worker = created
    return created
  }
  return {
    execute(request, signal) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
        const id = ++counter, target = start()
        pending.set(id, { resolve, reject })
        signal.addEventListener('abort', () => {
          if (!pending.delete(id)) return
          target.postMessage({ type: 'cancel', id } satisfies WorkerRequest)
          reject(new DOMException('Cancelled', 'AbortError'))
        }, { once: true })
        target.postMessage({ type: 'execute', id, request } satisfies WorkerRequest)
      })
    },
  }
}
