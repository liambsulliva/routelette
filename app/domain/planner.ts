export type Coordinates = [longitude: number, latitude: number]
export type Mode = 'bike' | 'run' | 'walk'
export type Units = 'mi' | 'km'
export type ElevationChoice = 'any' | 'flat' | 'hilly' | 'steep' | 'custom'
export type Surface = 'paved' | 'mixed' | 'trail'
export interface Place { id: string; label: string; coordinates: Coordinates }
export interface PlanningSettings {
  start: Place | null
  mode: Mode
  distanceMeters: number
  elevation: ElevationChoice
  customGainMeters: number | null
  surface: Surface
  avoidBusyRoads: boolean
  preferInfrastructure: boolean
  stops: Place[]
  orderLocked: boolean
  joints: Coordinates[]
  seed: number
}
export interface Turn {
  id: string
  street: string
  instruction: 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'arrive'
  distanceMeters: number
  coordinates: Coordinates[]
}
export interface RouteProvenance {
  kind: 'fixture' | 'snapshot'
  version: string
  region: string
}
export interface RouteCandidate {
  id: string
  name: string
  mode: Mode
  coordinates: Coordinates[]
  distanceMeters: number
  gainMeters: number | null
  elevationProfile: number[]
  turns: Turn[]
  settings: PlanningSettings
  provenance: RouteProvenance
  importedFrom?: 'strava'
}
export interface PlanningRequest {
  id: number
  operation: 'generate' | 'reshape' | 'reverse'
  settings: PlanningSettings
  route?: RouteCandidate
}
/** Something the panel should explain about a result. Distances are in meters so the panel can format them in the chosen units. */
export interface PlanningNotice { code: 'start-moved' | 'stops-over-budget' | 'off-target'; meters: number }
export interface PlanningResult {
  routes: RouteCandidate[]
  adjustedForLegality: boolean
  elevationAvailable: boolean
  notices?: PlanningNotice[]
}
export interface PlanningService {
  execute(request: PlanningRequest, signal: AbortSignal): Promise<PlanningResult>
}
export type PlanningFailureCode = 'unavailable' | 'elevation-unavailable' | 'outside-coverage' | 'preview-only' | 'no-route'
export class PlanningFailure extends Error {
  constructor(public code: PlanningFailureCode, message: string) { super(message); this.name = 'PlanningFailure' }
}
export function copySettings(settings: PlanningSettings): PlanningSettings {
  return JSON.parse(JSON.stringify(settings)) as PlanningSettings
}
export function initialSettings(): PlanningSettings {
  return {
    start: null, mode: 'run', distanceMeters: 5 * 1609.344, elevation: 'any', customGainMeters: null,
    surface: 'mixed', avoidBusyRoads: true, preferInfrastructure: true, stops: [], orderLocked: false,
    joints: [], seed: 1,
  }
}

export interface GraphManifest {
  schemaVersion: number
  version: string
  builtAt: string
  /** Width and height of each tile in degrees. */
  tileDegrees?: number
  regions: Array<{ id: string; name: string; bounds: [number, number, number, number]; tiles: string[]; dataTimestamp?: string }>
  attribution: string
}
export interface GraphTileProvider {
  manifest(signal: AbortSignal): Promise<GraphManifest>
  tile(version: string, id: string, signal: AbortSignal): Promise<ArrayBuffer>
}

export const MODE_ICONS: Record<Mode, string> = {
  bike: 'ph:person-simple-bike', run: 'ph:person-simple-run', walk: 'ph:person-simple-walk',
}
