/// <reference lib="webworker" />
import { createStore, get, set } from 'idb-keyval'
import { PlanningFailure } from '../domain/planner'
import type { GraphManifest, PlanningRequest } from '../domain/planner'
import { createTerrariumSource } from '../engine/elevation'
import { plan } from '../engine/engine'
import { decodeTile } from '../engine/format'
import type { DecodedTile } from '../engine/format'
import { createStaticGraphProvider } from '../services/graph-provider'
import type { WorkerRequest, WorkerResponse } from '../services/worker-planner'

declare const self: DedicatedWorkerGlobalScope

const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const MEMORY_TILES = 160
let provider: ReturnType<typeof createStaticGraphProvider> | null = null
let manifest: Promise<GraphManifest> | null = null
let store: ReturnType<typeof createStore> | null = null
const tiles = new Map<string, DecodedTile>()
const running = new Map<number, AbortController>()

function tileStore() {
  try { store ??= createStore('routelette-graph', 'tiles') } catch { store = null }
  return store
}

async function loadTile(version: string, id: string, signal: AbortSignal): Promise<DecodedTile> {
  const key = `${version}/${id}`
  const cached = tiles.get(key)
  if (cached) { tiles.delete(key); tiles.set(key, cached); return cached }
  const idb = tileStore()
  let data: ArrayBuffer | undefined
  try { data = idb ? await get<ArrayBuffer>(key, idb) : undefined } catch { data = undefined }
  if (!data) {
    data = await provider!.tile(version, id, signal)
    if (idb) set(key, data, idb).catch(() => { /* Routing still works without the persistent cache. */ })
  }
  const tile = decodeTile(data)
  tiles.set(key, tile)
  while (tiles.size > MEMORY_TILES) tiles.delete(tiles.keys().next().value!)
  return tile
}

const elevationTiles = new Map<string, Promise<Uint8ClampedArray | null>>()
const elevation = createTerrariumSource((z, x, y, signal) => {
  const key = `${z}/${x}/${y}`
  let job = elevationTiles.get(key)
  if (!job) {
    job = (async () => {
      const response = await fetch(`${TERRARIUM}/${key}.png`, { signal })
      if (!response.ok) return null
      const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
      const canvas = new OffscreenCanvas(256, 256)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return null
      context.drawImage(bitmap, 0, 0)
      return context.getImageData(0, 0, 256, 256).data
    })().catch(error => { elevationTiles.delete(key); if (error instanceof DOMException && error.name === 'AbortError') throw error; return null })
    elevationTiles.set(key, job)
  }
  return job
})

async function execute(id: number, request: PlanningRequest) {
  const abort = new AbortController()
  running.set(id, abort)
  const reply = (message: WorkerResponse) => self.postMessage(message)
  try {
    if (!provider) throw new PlanningFailure('unavailable', 'Regional routing snapshots are not available yet.')
    manifest ??= provider.manifest(abort.signal).catch(error => { manifest = null; throw error })
    const current = await manifest.catch(() => { throw new PlanningFailure('unavailable', "Can't load map data right now.") })
    const result = await plan(request, {
      manifest: current, elevation, signal: abort.signal,
      tile: (tile, signal) => loadTile(current.version, tile, signal),
      pause: () => new Promise(resolve => setTimeout(resolve, 0)),
    })
    if (!abort.signal.aborted) reply({ id, result })
  } catch (error) {
    if (abort.signal.aborted) return
    const code = error instanceof PlanningFailure ? error.code : 'unavailable'
    const message = error instanceof PlanningFailure ? error.message : "Can't load routes right now."
    if (!(error instanceof PlanningFailure)) console.error(error)
    reply({ id, error: { code, message } })
  } finally {
    running.delete(id)
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'init') provider = createStaticGraphProvider(message.manifestUrl)
  else if (message.type === 'cancel') running.get(message.id)?.abort()
  else if (message.type === 'execute') void execute(message.id, message.request)
}
