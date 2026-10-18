import { initialSettings } from '../domain/planner'
import type { Coordinates, Mode, RouteCandidate } from '../domain/planner'

const LIMIT = 32000
function coordinates(value: unknown): value is Coordinates[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 5000 && value.every(point => Array.isArray(point) && point.length === 2
    && typeof point[0] === 'number' && Number.isFinite(point[0]) && Math.abs(point[0]) <= 180
    && typeof point[1] === 'number' && Number.isFinite(point[1]) && Math.abs(point[1]) <= 90)
}
export function encodeRoute(route: RouteCandidate): string {
  const payload = JSON.stringify({ v: 1, name: route.name.slice(0, 120), mode: route.mode, points: route.coordinates,
    distance: route.distanceMeters, gain: route.gainMeters, start: route.settings.start?.label ?? 'Map location', fixture: route.provenance.kind === 'fixture' })
  const bytes = new TextEncoder().encode(payload)
  if (bytes.length > LIMIT / 1.4) throw new Error('This route is too large to share in a link.')
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
export function decodeRoute(hash: string): RouteCandidate | null {
  if (!hash || hash.length > LIMIT) return null
  try {
    const raw = atob(hash.replaceAll('-', '+').replaceAll('_', '/'))
    const data: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0))))
    if (!data || typeof data !== 'object' || !('v' in data) || data.v !== 1 || !('points' in data) || !coordinates(data.points)
      || !('name' in data) || typeof data.name !== 'string' || !('mode' in data) || !['bike', 'run', 'walk'].includes(String(data.mode))
      || !('distance' in data) || typeof data.distance !== 'number' || !Number.isFinite(data.distance) || data.distance <= 0 || data.distance > 1_000_000
      || !('gain' in data) || !(data.gain === null || typeof data.gain === 'number' && Number.isFinite(data.gain) && data.gain >= 0)) return null
    const settings = initialSettings()
    settings.start = { id: 'shared-start', label: 'start' in data && typeof data.start === 'string' ? data.start.slice(0, 200) : 'Map location', coordinates: data.points[0]! }
    settings.mode = data.mode as Mode; settings.distanceMeters = data.distance
    return { id: 'shared', name: data.name.slice(0, 120), mode: settings.mode, coordinates: data.points, distanceMeters: data.distance,
      gainMeters: data.gain, elevationProfile: [], turns: [], settings,
      provenance: { kind: 'fixture' in data && data.fixture === true ? 'fixture' : 'snapshot', version: 'shared-v1', region: 'Shared route' } }
  } catch { return null }
}
