import type { ElevationChoice, Mode, Units } from './planner'

export const METERS_PER_MILE = 1609.344
export const METERS_PER_FOOT = 0.3048
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
