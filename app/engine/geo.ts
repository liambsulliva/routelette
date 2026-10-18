import type { Coordinates } from '../domain/planner'

const EARTH_RADIUS = 6371008.8
const RAD = Math.PI / 180

export function haversine(a: Coordinates, b: Coordinates): number {
  const dLat = (b[1] - a[1]) * RAD, dLon = (b[0] - a[0]) * RAD
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function lineLength(points: Coordinates[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1]!, points[i]!)
  return total
}

/** Degrees clockwise from north. */
export function bearing(a: Coordinates, b: Coordinates): number {
  const y = Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD)
  const x = Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD)
  return (Math.atan2(y, x) / RAD + 360) % 360
}

export function destination(origin: Coordinates, bearingDegrees: number, meters: number): Coordinates {
  const d = meters / EARTH_RADIUS, t = bearingDegrees * RAD
  const lat1 = origin[1] * RAD, lon1 = origin[0] * RAD
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(t))
  const lon2 = lon1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [lon2 / RAD, lat2 / RAD]
}

/** Signed turn angle in degrees, positive to the right, in (-180, 180]. */
export function turnAngle(inBearing: number, outBearing: number): number {
  let delta = outBearing - inBearing
  while (delta > 180) delta -= 360
  while (delta <= -180) delta += 360
  return delta
}

/** A local planar projection in meters, accurate enough within a city. */
export function projector(origin: Coordinates) {
  const kx = Math.cos(origin[1] * RAD) * EARTH_RADIUS * RAD, ky = EARTH_RADIUS * RAD
  return {
    kx, ky,
    to(point: Coordinates): [number, number] { return [(point[0] - origin[0]) * kx, (point[1] - origin[1]) * ky] },
    from(x: number, y: number): Coordinates { return [origin[0] + x / kx, origin[1] + y / ky] },
  }
}

/** Closest point on segment ab to p in planar meters, with the fraction along the segment. */
export function projectOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0
  const x = ax + t * dx, y = ay + t * dy
  return { t, x, y, distance: Math.hypot(px - x, py - y) }
}

/** Douglas-Peucker simplification. Endpoints always stay. */
export function simplify(points: Coordinates[], toleranceMeters: number): Coordinates[] {
  if (points.length <= 2) return points
  const project = projector(points[0]!)
  const xy = points.map(point => project.to(point))
  const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let index = -1, worst = toleranceMeters
    for (let i = first + 1; i < last; i++) {
      const d = projectOnSegment(xy[i]![0], xy[i]![1], xy[first]![0], xy[first]![1], xy[last]![0], xy[last]![1]).distance
      if (d > worst) { worst = d; index = i }
    }
    if (index >= 0) { keep[index] = 1; stack.push([first, index], [index, last]) }
  }
  return points.filter((_, i) => keep[i])
}

/** Shoelace area in square meters. */
export function polygonArea(points: Coordinates[]): number {
  if (points.length < 3) return 0
  const project = projector(points[0]!)
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = project.to(points[i]!), [x2, y2] = project.to(points[(i + 1) % points.length]!)
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}
