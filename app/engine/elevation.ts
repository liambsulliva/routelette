import type { Coordinates } from '../domain/planner'
import { haversine } from './geo'

/** Elevation lookups for one request area. `load` fetches what's needed; `at` is synchronous afterwards. */
export interface ElevationSource {
  load(bounds: [number, number, number, number], signal: AbortSignal): Promise<boolean>
  at(point: Coordinates): number | null
}

/** Points every `spacing` meters along a line, including both ends. */
export function resample(points: Coordinates[], spacing: number): Coordinates[] {
  if (points.length < 2) return points
  const result: Coordinates[] = [points[0]!]
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!
    const length = haversine(a, b)
    let along = spacing - carry
    while (along < length) {
      const t = along / length
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      along += spacing
    }
    carry = length - (along - spacing)
  }
  result.push(points.at(-1)!)
  return result
}

/**
 * Gain from samples 20 m apart. Samples are smoothed over about 100 m, and a rise only counts once it
 * clears a 1 m threshold, so DEM noise doesn't add phantom climbing.
 */
export function gainFrom(samples: number[]): number {
  if (samples.length < 2) return 0
  const smoothed = samples.map((_, i) => {
    let sum = 0, count = 0
    for (let k = Math.max(0, i - 2); k <= Math.min(samples.length - 1, i + 2); k++) { sum += samples[k]!; count++ }
    return sum / count
  })
  let gain = 0, reference = smoothed[0]!
  for (const value of smoothed) {
    if (value > reference + 1) { gain += value - reference; reference = value }
    else if (value < reference) reference = value
  }
  return gain
}

export function profileFor(points: Coordinates[], source: ElevationSource): { samples: number[]; gain: number } | null {
  const samples: number[] = []
  for (const point of resample(points, 20)) {
    const value = source.at(point)
    if (value === null) return null
    samples.push(value)
  }
  const gain = gainFrom(samples)
  const step = Math.max(1, Math.ceil(samples.length / 120))
  return { samples: samples.filter((_, i) => i % step === 0 || i === samples.length - 1).map(value => Math.round(value * 10) / 10), gain }
}

const Z = 12
function tileX(lon: number) { return (lon + 180) / 360 * 2 ** Z }
function tileY(lat: number) { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** Z }

/**
 * Terrarium DEM tiles (https://registry.opendata.aws/terrain-tiles/) at zoom 12, about 30 m per pixel here.
 * `decode` turns PNG bytes into RGBA pixels, so the worker and tests can each supply their own.
 */
export function createTerrariumSource(fetchTile: (z: number, x: number, y: number, signal: AbortSignal) => Promise<Uint8ClampedArray | null>): ElevationSource {
  const tiles = new Map<string, Float32Array | null>()
  return {
    async load(bounds, signal) {
      const [west, south, east, north] = bounds
      const jobs: Array<Promise<void>> = []
      for (let x = Math.floor(tileX(west)); x <= Math.floor(tileX(east)); x++) {
        for (let y = Math.floor(tileY(north)); y <= Math.floor(tileY(south)); y++) {
          const key = `${x}/${y}`
          if (tiles.has(key)) continue
          jobs.push(fetchTile(Z, x, y, signal).then(rgba => {
            if (!rgba) { tiles.set(key, null); return }
            const heights = new Float32Array(256 * 256)
            for (let i = 0; i < heights.length; i++) heights[i] = rgba[i * 4]! * 256 + rgba[i * 4 + 1]! + rgba[i * 4 + 2]! / 256 - 32768
            tiles.set(key, heights)
          }))
        }
      }
      await Promise.all(jobs)
      for (let x = Math.floor(tileX(west)); x <= Math.floor(tileX(east)); x++) {
        for (let y = Math.floor(tileY(north)); y <= Math.floor(tileY(south)); y++) if (!tiles.get(`${x}/${y}`)) return false
      }
      return true
    },
    at([lon, lat]) {
      const fx = tileX(lon) * 256 - 0.5, fy = tileY(lat) * 256 - 0.5
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
      const pixel = (px: number, py: number) => {
        const tile = tiles.get(`${Math.floor(px / 256)}/${Math.floor(py / 256)}`)
        return tile ? tile[(py & 255) * 256 + (px & 255)]! : null
      }
      const a = pixel(x0, y0), b = pixel(x0 + 1, y0), c = pixel(x0, y0 + 1), d = pixel(x0 + 1, y0 + 1)
      if (a === null || b === null || c === null || d === null) return null
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
    },
  }
}
