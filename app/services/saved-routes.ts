import { get, set } from 'idb-keyval'
import type { RouteCandidate } from '../domain/planner'

const KEY = 'routelette:saved:v1'
export interface SavedRoutes { load(): Promise<RouteCandidate[]>; save(routes: RouteCandidate[]): Promise<void> }
export function createSavedRoutes(): SavedRoutes {
  return {
    async load() {
      const value: unknown = await get(KEY)
      if (!Array.isArray(value)) return []
      return value.filter((route): route is RouteCandidate => !!route && typeof route === 'object'
        && typeof route.id === 'string' && typeof route.name === 'string' && Array.isArray(route.coordinates)
        && !!route.settings && !!route.provenance)
    },
    async save(routes) { await set(KEY, JSON.parse(JSON.stringify(routes))) },
  }
}
