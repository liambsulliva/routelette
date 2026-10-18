import data from '../data/route-fixtures.json'
import { copySettings, initialSettings, PlanningFailure } from '../domain/planner'
import type { Coordinates, Mode, PlanningService, RouteCandidate, Turn } from '../domain/planner'

export const PREVIEW_START = { id: 'friendship', label: '4900 Friendship Ave', coordinates: data.region.start.coordinates as Coordinates }
export const PREVIEW_STOP = { id: 'rosetta', label: 'Rosetta St & N Mathilda St', coordinates: data.region.checkpoint.coordinates as Coordinates }

type Fixture = typeof data.routeOptions[number] | typeof data.savedRoutes[number]
function mode(value: string): Mode { return value === 'bike' || value === 'walk' ? value : 'run' }
function turnInstruction(value: string): Turn['instruction'] {
  if (value.includes('left')) return 'left'
  if (value.includes('right')) return 'right'
  if (value === 'arrive') return 'arrive'
  return 'straight'
}
export function fixtureRoute(fixture: Fixture): RouteCandidate {
  const settings = initialSettings()
  settings.start = { ...PREVIEW_START, coordinates: [...PREVIEW_START.coordinates] }
  settings.mode = mode(fixture.mode)
  settings.distanceMeters = fixture.displayDistanceMeters
  settings.stops = [PREVIEW_STOP]
  return {
    id: fixture.id, name: fixture.name, mode: settings.mode,
    coordinates: fixture.displayGeometry.coordinates.map(p => [p[0]!, p[1]!] as Coordinates),
    distanceMeters: fixture.displayDistanceMeters, gainMeters: fixture.snapshot.gainFeet * 0.3048,
    elevationProfile: fixture.elevationsMeters.filter((value): value is number => typeof value === 'number'),
    turns: fixture.turns.map(turn => ({
      id: turn.id, street: turn.streetName, instruction: turnInstruction(turn.maneuver),
      distanceMeters: turn.distanceMeters,
      coordinates: turn.geometry.coordinates.map(p => [p[0]!, p[1]!] as Coordinates),
    })),
    settings,
    provenance: { kind: 'fixture', version: 'figma-2026-10-18', region: data.region.name },
  }
}
export function previewRoutes(): RouteCandidate[] { return data.routeOptions.map(fixtureRoute) }
export function previewSavedRoutes(): RouteCandidate[] { return data.savedRoutes.map(fixtureRoute) }

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Recorded data for the first visual review. It never claims to apply routing costs or legality. */
export function createFixturePlanner(latencyMs = 300): PlanningService {
  return {
    async execute(request, signal) {
      await wait(latencyMs, signal)
      if (request.operation !== 'generate') {
        throw new PlanningFailure('preview-only', 'Route editing needs the regional routing snapshots. This preview uses recorded routes.')
      }
      const point = request.settings.start?.coordinates
      if (!point || Math.abs(point[0] - PREVIEW_START.coordinates[0]) > 0.02 || Math.abs(point[1] - PREVIEW_START.coordinates[1]) > 0.02) {
        throw new PlanningFailure('preview-only', 'This design preview has routes from Bloomfield. Use Preview Bloomfield to view them.')
      }
      const routes = previewRoutes()
      const offset = request.settings.seed % routes.length
      const ordered = [...routes.slice(offset), ...routes.slice(0, offset)]
      return {
        routes: ordered.map((route, index) => ({
          ...route, id: `route-${index + 1}`, name: `Route ${index + 1}`, mode: request.settings.mode,
          settings: copySettings(request.settings),
        })),
        adjustedForLegality: false, elevationAvailable: true,
      }
    },
  }
}

export function createUnavailablePlanner(): PlanningService {
  return { async execute() { throw new PlanningFailure('unavailable', 'Regional routing snapshots are not available yet.') } }
}
