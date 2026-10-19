import type { ElevationChoice, Mode, PlanningSettings, Units } from './planner'

export const METERS_PER_MILE = 1609.344
export const METERS_PER_FOOT = 0.3048
/** Grace on each edge of an elevation band, so a route just outside the band still counts. */
export const ELEVATION_GRACE_METERS = 50 * METERS_PER_FOOT
/** A route may take up to this much of the other surface before the surface choice rejects it. */
export const SURFACE_GRACE_METERS = METERS_PER_MILE
export const MODE_LIMITS: Record<Mode, { minimum: number; maximum: number; step: number; cap: number; default: number }> = {
  bike: { minimum: 5, maximum: 60, step: 1, cap: 150, default: 15 },
  run: { minimum: 1, maximum: 26, step: 0.5, cap: 50, default: 5 },
  walk: { minimum: 0.5, maximum: 10, step: 0.25, cap: 30, default: 2 },
}
export function toDistance(meters: number, units: Units): number { return meters / (units === 'mi' ? METERS_PER_MILE : 1000) }
export function fromDistance(value: number, units: Units): number { return value * (units === 'mi' ? METERS_PER_MILE : 1000) }
export function distanceText(meters: number, units: Units): string { return toDistance(meters, units).toFixed(1) }
export function gainText(meters: number | null, units: Units): string {
  return meters === null ? 'Unavailable' : Math.round(meters / (units === 'mi' ? METERS_PER_FOOT : 1)).toString()
}
export function distanceLimits(mode: Mode, units: Units) {
  const profile = MODE_LIMITS[mode]
  const scale = units === 'mi' ? 1 : METERS_PER_MILE / 1000
  return { minimum: profile.minimum * scale, maximum: profile.maximum * scale, step: profile.step * scale, cap: profile.cap * scale }
}
export function commitDistance(value: string, mode: Mode, units: Units, previous: number): number {
  const number = Number(value.trim())
  if (!Number.isFinite(number) || value.trim() === '') return previous
  const limits = distanceLimits(mode, units)
  return fromDistance(Math.min(limits.cap, Math.max(limits.minimum, number)), units)
}
export function clampToMode(meters: number, mode: Mode): number {
  const limits = MODE_LIMITS[mode]
  return Math.min(limits.maximum * METERS_PER_MILE, Math.max(limits.minimum * METERS_PER_MILE, meters))
}
export function minutesFor(meters: number, mode: Mode, pace: Record<Mode, number>): number {
  return Math.max(1, Math.round(meters / METERS_PER_MILE * pace[mode]))
}
/** Pace is stored as minutes per mile. Kilometers show the same pace per kilometer. */
export const PACE_LIMITS = { minimum: 1, maximum: 120 }
/** Minutes per mile for each mode: 12 mph biking, a 9:30 mile run, and a 20 minute mile walk. */
export const DEFAULT_PACE: Record<Mode, number> = { bike: 5, run: 9.5, walk: 20 }
const KILOMETERS_PER_MILE = METERS_PER_MILE / 1000
export function paceFor(minutesPerMile: number, units: Units): number {
  return units === 'mi' ? minutesPerMile : minutesPerMile / KILOMETERS_PER_MILE
}
/** Converts a typed pace back to minutes per mile. */
export function paceFromInput(value: number, units: Units): number {
  return units === 'mi' ? value : value * KILOMETERS_PER_MILE
}
export function paceSuffix(units: Units): string { return units === 'mi' ? 'min/mi' : 'min/km' }
export function paceText(minutesPerMile: number, units: Units): string { return String(Math.round(paceFor(minutesPerMile, units) * 100) / 100) }
/** Total gain, in meters, that a route of this length may have for the elevation choice, grace included. Null when the choice doesn't constrain gain. */
export function gainLimits(settings: Pick<PlanningSettings, 'elevation' | 'customGainMeters'>, lengthMeters: number): { low: number; high: number } | null {
  const perMile = (feet: number) => feet * METERS_PER_FOOT * lengthMeters / METERS_PER_MILE
  const grace = ELEVATION_GRACE_METERS
  if (settings.elevation === 'flat') return { low: 0, high: perMile(20) + grace }
  if (settings.elevation === 'hilly') return { low: Math.max(0, perMile(40) - grace), high: perMile(80) + grace }
  if (settings.elevation === 'steep') return { low: Math.max(0, perMile(100) - grace), high: Infinity }
  if (settings.elevation === 'custom' && settings.customGainMeters !== null) return { low: Math.max(0, settings.customGainMeters - grace), high: settings.customGainMeters + grace }
  return null
}
export function elevationCaption(choice: ElevationChoice, distanceMeters: number, units: Units): string {
  const miles = distanceMeters / METERS_PER_MILE
  const unit = units === 'mi' ? 'ft' : 'm'
  const convert = (feet: number) => Math.round(units === 'mi' ? feet : feet * METERS_PER_FOOT)
  if (choice === 'any') return 'Any: Elevation is not scored'
  if (choice === 'flat') return `Under ${convert(20 * miles)} ${unit}`
  if (choice === 'hilly') return `${convert(40 * miles)} to ${convert(80 * miles)} ${unit}`
  if (choice === 'steep') return `${convert(100 * miles)} ${unit} or more`
  return ''
}
export function routeThumbnail(coordinates: [number, number][]): string {
  if (coordinates.length < 2) return ''
  const xs = coordinates.map(p => p[0]), ys = coordinates.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const scale = Math.min(28 / Math.max(maxX - minX, 0.000001), 28 / Math.max(maxY - minY, 0.000001))
  return coordinates.map(([x, y]) => `${(20 + (x - (minX + maxX) / 2) * scale).toFixed(2)},${(20 - (y - (minY + maxY) / 2) * scale).toFixed(2)}`).join(' ')
}
