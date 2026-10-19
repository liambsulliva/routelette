import { copySettings, PlanningFailure } from '../domain/planner'
import type { Coordinates, GraphManifest, PlanningNotice, PlanningRequest, PlanningResult, PlanningSettings, RouteCandidate } from '../domain/planner'
import { gainLimits, SURFACE_GRACE_METERS } from '../domain/units'
import { profileFor } from './elevation'
import type { ElevationSource } from './elevation'
import { tileKey, WAY } from './format'
import type { DecodedTile } from './format'
import { bearing, destination, haversine, lineLength, projectOnSegment, projector } from './geo'
import { RoutingGraph } from './graph'
import { edgeLengths, mulberry32, overlap, pathCoordinates, pathCost, pathLength, removeParallelSpurs, removeSpurs, repeatedLength, routeThrough, usableDegree } from './loops'
import { buildProfile, offPavement } from './profile'
import type { Profile } from './profile'
import { PathFinder } from './search'
import { buildTurns } from './turns'

export interface EngineContext {
  manifest: GraphManifest
  tile(id: string, signal: AbortSignal): Promise<DecodedTile>
  elevation: ElevationSource
  signal: AbortSignal
  /** Lets the worker handle a cancel message between candidates. */
  pause(): Promise<void>
  now?(): number
}

const CANDIDATES = 12
const TIME_BUDGET_MS = 6000
const TORTUOSITY = 1.3

type Bounds = [number, number, number, number]
interface Fixed { node: number; point: Coordinates; kind: 'stop' | 'joint' }
interface Candidate { path: number[]; length: number; cost: number; edges: Map<number, number>; score: number; joints: boolean; fits: boolean }

function abortIfCancelled(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError') }

function expand(bounds: Bounds, point: Coordinates): Bounds {
  return [Math.min(bounds[0], point[0]), Math.min(bounds[1], point[1]), Math.max(bounds[2], point[0]), Math.max(bounds[3], point[1])]
}
function pad(bounds: Bounds, meters: number): Bounds {
  const project = projector([(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2])
  return [bounds[0] - meters / project.kx, bounds[1] - meters / project.ky, bounds[2] + meters / project.kx, bounds[3] + meters / project.ky]
}

/** Search area for a request. A loop of length D around a circle stays within about D / 2 of its start. */
function requestBounds(request: PlanningRequest): Bounds {
  const start = request.settings.start!.coordinates
  let bounds: Bounds = [start[0], start[1], start[0], start[1]]
  for (const stop of request.settings.stops) bounds = expand(bounds, stop.coordinates)
  for (const joint of request.settings.joints) bounds = expand(bounds, joint)
  if (request.operation !== 'generate' && request.route) {
    for (const point of request.route.coordinates) bounds = expand(bounds, point)
    return pad(bounds, 1500)
  }
  return pad(bounds, Math.min(40000, request.settings.distanceMeters / 2 + 1500))
}

async function loadGraph(request: PlanningRequest, context: EngineContext, bounds: Bounds) {
  const start = request.settings.start!.coordinates
  const region = context.manifest.regions.find(r => start[0] >= r.bounds[0] && start[0] <= r.bounds[2] && start[1] >= r.bounds[1] && start[1] <= r.bounds[3])
  if (!region) throw new PlanningFailure('outside-coverage', 'Routelette plans loops around Pittsburgh and Washington, DC for now.')
  const degrees = context.manifest.tileDegrees ?? 0.05
  const available = new Set(region.tiles)
  const ids: string[] = []
  for (let x = Math.floor(bounds[0] / degrees); x <= Math.floor(bounds[2] / degrees); x++) {
    for (let y = Math.floor(bounds[1] / degrees); y <= Math.floor(bounds[3] / degrees); y++) {
      const id = tileKey(region.id, x * degrees + degrees / 2, y * degrees + degrees / 2, degrees)
      if (available.has(id)) ids.push(id)
    }
  }
  const tiles: DecodedTile[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++]!
      tiles.push(await context.tile(id, context.signal))
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker)) }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new PlanningFailure('unavailable', "Can't load map data right now.")
  }
  return { region, graph: RoutingGraph.fromTiles(tiles) }
}

/** Edges the mode can use that belong to the largest connected network, so points never snap onto an isolated fragment. */
function usableEdge(graph: RoutingGraph, settings: PlanningSettings) {
  const bits = settings.mode === 'bike' ? WAY.BIKE_FORWARD | WAY.BIKE_BACKWARD : WAY.FOOT_FORWARD | WAY.FOOT_BACKWARD
  const allowed = (edge: number) => (graph.wayFlags[graph.edgeWay[edge]!]! & bits) !== 0
  const parent = Int32Array.from({ length: graph.nodeCount }, (_, i) => i)
  const root = (node: number): number => { while (parent[node] !== node) { parent[node] = parent[parent[node]!]!; node = parent[node]! } return node }
  for (let e = 0; e < graph.edgeCount; e++) if (allowed(e)) { const a = root(graph.edgeA[e]!), b = root(graph.edgeB[e]!); if (a !== b) parent[a] = b }
  const sizes = new Map<number, number>()
  for (let e = 0; e < graph.edgeCount; e++) if (allowed(e)) { const r = root(graph.edgeA[e]!); sizes.set(r, (sizes.get(r) ?? 0) + 1) }
  let main = -1, largest = 0
  for (const [r, size] of sizes) if (size > largest) { largest = size; main = r }
  return (edge: number) => allowed(edge) && root(graph.edgeA[edge]!) === main
}

/** Keeps to the surface choice, allowing a mile of the other surface. Mixed takes anything. */
export function surfaceFits(graph: RoutingGraph, path: number[], surface: PlanningSettings['surface']): boolean {
  if (surface === 'mixed') return true
  let off = 0, paved = 0
  for (const halfEdge of path) {
    const edge = halfEdge >> 1, way = graph.edgeWay[edge]!
    if (offPavement(graph.wayFlags[way]!, graph.wayHighway[way]!)) off += graph.edgeLength[edge]!
    else paved += graph.edgeLength[edge]!
  }
  return surface === 'trail' ? paved <= SURFACE_GRACE_METERS : off <= SURFACE_GRACE_METERS
}

export async function plan(request: PlanningRequest, context: EngineContext): Promise<PlanningResult> {
  const settings = request.settings
  if (!settings.start) throw new PlanningFailure('no-route', 'Pick a start first.')
  const now = context.now ?? (() => Date.now())
  const bounds = requestBounds(request)
  const { region, graph } = await loadGraph(request, context, bounds)
  abortIfCancelled(context.signal)

  const notices: PlanningNotice[] = []
  const usable = usableEdge(graph, settings)
  const startSnap = graph.snapToEdge(settings.start.coordinates, 500, usable)
  if (!startSnap) throw new PlanningFailure('no-route', settings.mode === 'bike' ? 'No rideable streets near this start.' : 'No walkable paths near this start.')
  if (startSnap.distance > 20) notices.push({ code: 'start-moved', meters: startSnap.distance })
  const startNode = startSnap.node
  const stops: Fixed[] = []
  for (const stop of settings.stops) {
    const snap = graph.snapToEdge(stop.coordinates, 300, usable)
    if (snap) stops.push({ node: snap.node, point: stop.coordinates, kind: 'stop' })
  }
  const joints: Fixed[] = []
  for (const joint of settings.joints) {
    const snap = graph.snapToEdge(joint, 150, usable)
    if (snap) joints.push({ node: snap.node, point: joint, kind: 'joint' })
  }

  const elevationAvailable = await context.elevation.load(bounds, context.signal).catch(error => {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return false
  })
  abortIfCancelled(context.signal)
  if (!elevationAvailable && settings.elevation !== 'any') throw new PlanningFailure('elevation-unavailable', "Elevation data isn't available right now.")
  let elevations: Float64Array | null = null
  if (elevationAvailable && settings.elevation !== 'any') {
    elevations = new Float64Array(graph.nodeCount)
    for (let i = 0; i < graph.nodeCount; i++) elevations[i] = context.elevation.at(graph.point(i)) ?? 0
  }
  const rate = settings.elevation === 'custom' && settings.customGainMeters !== null ? settings.customGainMeters / settings.distanceMeters : null
  const grade = { elevations, choice: settings.elevation, rate }

  const required = new Set([startNode, ...stops.map(s => s.node), ...joints.map(j => j.node)])
  let routeIndex = 0
  const toRoute = (path: number[]): RouteCandidate => {
    const id = `route-${request.id}-${++routeIndex}`
    const coordinates = pathCoordinates(graph, path)
    const elevation = elevationAvailable ? profileFor(coordinates, context.elevation) : null
    return {
      id, name: `Route ${routeIndex}`, mode: settings.mode, coordinates,
      distanceMeters: pathLength(graph, path), gainMeters: elevation ? elevation.gain : null,
      elevationProfile: elevation?.samples ?? [], turns: buildTurns(graph, path, id),
      settings: copySettings(settings), provenance: { kind: 'snapshot', version: context.manifest.version, region: region.name },
    }
  }

  if (request.operation === 'generate') {
    const profile = buildProfile(graph, settings, grade)
    const finder = new PathFinder(graph, profile)
    const result = await generate({ graph, profile, finder, settings, startNode, stops, joints, required, context, now })
    notices.push(...result.notices)
    // An empty list is a result, not an error. The planner shows "No routes available" where the cards would be.
    const routes = result.paths.map(toRoute)
    return { routes, adjustedForLegality: false, elevationAvailable, notices }
  }

  const original = request.route
  if (!original || original.coordinates.length < 2) throw new PlanningFailure('no-route', 'Select a route first.')
  const guide = guideEdges(graph, original.coordinates)
  const profile = buildProfile(graph, settings, grade, guide)
  const finder = new PathFinder(graph, profile)
  const sequence = request.operation === 'reverse'
    ? reverseAnchors(graph, profile, guide, original.coordinates, startNode)
    : reshapeAnchors(graph, profile, guide, original.coordinates, startNode, [...stops, ...joints])
  const raw = routeThrough(graph, finder, sequence, false)
  if (!raw) throw new PlanningFailure('no-route', request.operation === 'reverse' ? "Couldn't find a legal route in the other direction." : "Couldn't route through that point.")
  const path = removeParallelSpurs(graph, finder, removeSpurs(graph, raw, required), required)
  let adjusted = false
  if (request.operation === 'reverse') {
    const length = pathLength(graph, path)
    let onRoute = 0
    for (const halfEdge of path) if (guide.has(graph.edgeOrigin[halfEdge >> 1]!)) onRoute += graph.edgeLength[halfEdge >> 1]!
    adjusted = onRoute / Math.max(1, length) < 0.97 || Math.abs(length - original.distanceMeters) / Math.max(1, original.distanceMeters) > 0.03
  }
  return { routes: [toRoute(path)], adjustedForLegality: adjusted, elevationAvailable, notices }
}

interface GenerateInput {
  graph: RoutingGraph
  profile: Profile
  finder: PathFinder
  settings: PlanningSettings
  startNode: number
  stops: Fixed[]
  joints: Fixed[]
  required: Set<number>
  context: EngineContext
  now: () => number
}

/** Orders points by bearing around the start, beginning after the widest gap so the loop doesn't cross itself. */
function orderByBearing(start: Coordinates, points: Fixed[], clockwise: boolean): Fixed[] {
  if (points.length < 2) return points
  const sorted = points.map(point => ({ point, angle: bearing(start, point.point) })).sort((a, b) => a.angle - b.angle)
  let widest = 0, gap = -1
  for (let i = 0; i < sorted.length; i++) {
    const next = sorted[(i + 1) % sorted.length]!.angle + (i === sorted.length - 1 ? 360 : 0)
    if (next - sorted[i]!.angle > gap) { gap = next - sorted[i]!.angle; widest = i }
  }
  const ordered = [...sorted.slice(widest + 1), ...sorted.slice(0, widest + 1)].map(item => item.point)
  return clockwise ? ordered : ordered.reverse()
}

async function generate(input: GenerateInput): Promise<{ paths: number[][]; notices: PlanningNotice[] }> {
  const { graph, profile, finder, settings, startNode, stops, joints, required, context, now } = input
  const target = settings.distanceMeters
  const start = graph.point(startNode)
  const degree = usableDegree(graph, profile)
  const deadline = now() + TIME_BUDGET_MS
  const notices: PlanningNotice[] = []

  const corner = (point: Coordinates): number | null => {
    let best = -1, bestScore = Infinity
    for (const node of graph.nodesNear(point, 350)) {
      if (degree[node]! < 2 || profile.blocked(node)) continue
      const score = haversine(point, graph.point(node)) * (degree[node]! >= 3 ? 1 : 2.5)
      if (score < bestScore) { bestScore = score; best = node }
    }
    return best >= 0 ? best : null
  }
  const finish = (path: number[] | null) => path ? removeParallelSpurs(graph, finder, removeSpurs(graph, path, required), required) : null
  const evaluate = (path: number[], usesJoints: boolean): Candidate => {
    const length = pathLength(graph, path)
    const cost = pathCost(profile, path)
    const distanceError = Math.abs(length - target) / target
    const repeated = repeatedLength(graph, path) / Math.max(1, length)
    let score = 3 * Math.max(0, distanceError - 0.03) + 2 * repeated + 0.4 * Math.log(Math.max(0.3, cost / Math.max(1, length)))
    // The elevation band steers the search. The fit check below decides what is kept.
    const limits = gainLimits(settings, length)
    const gain = limits ? profileFor(pathCoordinates(graph, path), context.elevation)?.gain ?? null : null
    if (limits && gain !== null) {
      const miss = gain < limits.low ? (limits.low - gain) / Math.max(limits.low, 1) : gain > limits.high ? (gain - limits.high) / Math.max(limits.high, 1) : 0
      score += 1.5 * Math.min(2, miss)
    }
    const fits = surfaceFits(graph, path, settings.surface) && (!limits || (gain !== null && gain >= limits.low && gain <= limits.high))
    if (!fits) score += 10
    return { path, length, cost, edges: edgeLengths(graph, path), score, joints: usesJoints, fits }
  }

  const candidates: Candidate[] = []
  const baseSeed = (settings.seed >>> 0) ^ 0x5f3759df
  const sortedStops = settings.orderLocked ? stops : null

  // Stops alone may already need more distance than the target allows.
  if (stops.length) {
    const options = sortedStops ? [sortedStops] : [orderByBearing(start, stops, true), orderByBearing(start, stops, false)]
    let shortest: number[] | null = null
    for (const order of options) {
      const path = finish(routeThrough(graph, finder, [startNode, ...order.map(s => s.node), startNode]))
      if (path && (!shortest || pathLength(graph, path) < pathLength(graph, shortest))) shortest = path
    }
    if (shortest && pathLength(graph, shortest) > target * 1.1) {
      notices.push({ code: 'stops-over-budget', meters: pathLength(graph, shortest) })
      return { paths: evaluate(shortest, false).fits ? [shortest] : [], notices }
    }
  }

  for (let c = 0; c < CANDIDATES; c++) {
    if (c > 0 && now() > deadline && candidates.length >= 3) break
    await context.pause()
    abortIfCancelled(context.signal)
    const random = mulberry32(baseSeed + Math.imul(c + 1, 0x9e3779b1))
    const clockwise = random() < 0.5
    const useJoints = c === 0 && joints.length > 0
    const fixedPoints = useJoints ? [...stops, ...joints] : stops
    const fixed = settings.orderLocked && !useJoints ? fixedPoints : orderByBearing(start, fixedPoints, clockwise)

    let best: Candidate | null = null
    if (!fixed.length) {
      const sides = 2 + Math.floor(random() * 3)
      const heading = random() * 360
      const jitter = Array.from({ length: sides }, () => [(random() - 0.5) * 30, 0.85 + random() * 0.3] as const)
      let radius = target / (TORTUOSITY * 2 * (sides + 1) * Math.sin(Math.PI / (sides + 1)))
      for (let attempt = 0; attempt < 4; attempt++) {
        const center = destination(start, heading, radius)
        const back = (heading + 180) % 360
        const nodes = [startNode]
        for (let i = 1; i <= sides; i++) {
          const [angle, scale] = jitter[i - 1]!
          const point = destination(center, back + (clockwise ? 1 : -1) * (i * 360 / (sides + 1) + angle), radius * scale)
          const node = corner(point)
          if (node !== null && node !== nodes.at(-1)) nodes.push(node)
        }
        nodes.push(startNode)
        const path = finish(routeThrough(graph, finder, nodes))
        if (!path || !path.length) { radius *= 0.8; continue }
        const candidate = evaluate(path, false)
        if (!best || candidate.score < best.score) best = candidate
        const ratio = target / Math.max(1, candidate.length)
        if (Math.abs(1 - ratio) < 0.05) break
        radius *= Math.min(2, Math.max(0.5, ratio))
      }
    } else {
      // Fixed points set the shape. A filler point pushed out from the longest side adds the missing distance.
      const sequence = [startNode, ...fixed.map(f => f.node), startNode]
      const base = finish(routeThrough(graph, finder, sequence))
      if (base && base.length) {
        best = evaluate(base, useJoints)
        const points = sequence.map(node => graph.point(node))
        let side = 0, longest = -1
        for (let i = 1; i < points.length; i++) {
          const length = haversine(points[i - 1]!, points[i]!) * (0.6 + random() * 0.8)
          if (length > longest) { longest = length; side = i }
        }
        const a = points[side - 1]!, b = points[side]!
        const middle: Coordinates = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const centroid: Coordinates = [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length]
        let outward = haversine(a, b) < 30 ? random() * 360 : (bearing(a, b) + (clockwise ? -90 : 90) + 360) % 360
        if (haversine(centroid, middle) > 30 && Math.abs(((bearing(centroid, middle) - outward + 540) % 360) - 180) > 90) outward = (outward + 180) % 360
        outward += (random() - 0.5) * 40
        let offset = Math.max(200, (target - best.length) / 2.4)
        for (let attempt = 0; attempt < 4 && best.length < target * 0.95; attempt++) {
          const filler = corner(destination(middle, outward, offset))
          if (filler === null) { offset *= 0.7; continue }
          const nodes = [...sequence.slice(0, side), filler, ...sequence.slice(side)]
          const path = finish(routeThrough(graph, finder, nodes))
          if (!path || !path.length) { offset *= 0.7; continue }
          const candidate = evaluate(path, useJoints)
          if (candidate.score < best.score) best = candidate
          const missing = target - candidate.length
          if (Math.abs(missing) / target < 0.05) break
          offset = Math.max(100, offset + missing / 2.4)
        }
      }
    }
    if (best) candidates.push(best)
  }

  // Keep up to three distinct routes, best first. A route through the joints leads when there is one.
  candidates.sort((a, b) => Number(b.joints) - Number(a.joints) || a.score - b.score)
  const picked: Candidate[] = []
  for (const candidate of candidates) {
    if (picked.length >= 3) break
    if (!candidate.fits || picked.some(p => overlap(p.edges, candidate.edges) > 0.55)) continue
    picked.push(candidate)
  }
  const closest = picked[0]
  if (closest && Math.abs(closest.length - target) / target > 0.1) notices.push({ code: 'off-target', meters: closest.length })
  return { paths: picked.map(p => p.path), notices }
}

/** Edges that run along an existing route, so reversing or reshaping can stay on it. */
function guideEdges(graph: RoutingGraph, route: Coordinates[]): Set<number> {
  const project = projector(route[0]!)
  const cell = 60
  const grid = new Map<string, Array<[number, number, number, number]>>()
  const xy = route.map(point => project.to(point))
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 1; i < xy.length; i++) {
    const [ax, ay] = xy[i - 1]!, [bx, by] = xy[i]!
    minX = Math.min(minX, ax, bx); minY = Math.min(minY, ay, by); maxX = Math.max(maxX, ax, bx); maxY = Math.max(maxY, ay, by)
    for (let gx = Math.floor(Math.min(ax, bx) / cell) - 1; gx <= Math.floor(Math.max(ax, bx) / cell) + 1; gx++) {
      for (let gy = Math.floor(Math.min(ay, by) / cell) - 1; gy <= Math.floor(Math.max(ay, by) / cell) + 1; gy++) {
        const key = `${gx},${gy}`
        const list = grid.get(key); if (list) list.push([ax, ay, bx, by]); else grid.set(key, [[ax, ay, bx, by]])
      }
    }
  }
  const near = (point: Coordinates) => {
    const [x, y] = project.to(point)
    if (x < minX - 20 || x > maxX + 20 || y < minY - 20 || y > maxY + 20) return false
    const segments = grid.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`)
    return !!segments?.some(([ax, ay, bx, by]) => projectOnSegment(x, y, ax, ay, bx, by).distance < 12)
  }
  const guide = new Set<number>()
  for (let e = 0; e < graph.edgeCount; e++) {
    const geometry = graph.edgeGeometry[e]!
    if (near(geometry[0]!) && near(geometry.at(-1)!) && near(geometry[Math.floor(geometry.length / 2)]!)) guide.add(graph.edgeOrigin[e]!)
  }
  return guide
}

/** Junctions on the route at roughly even spacing, as [distance along the route, node]. */
function anchorsAlong(graph: RoutingGraph, profile: Profile, guide: Set<number>, route: Coordinates[], spacing: number): Array<[number, number]> {
  const onRoute = new Set<number>()
  for (let e = 0; e < graph.edgeCount; e++) if (guide.has(graph.edgeOrigin[e]!)) { onRoute.add(graph.edgeA[e]!); onRoute.add(graph.edgeB[e]!) }
  const anchors: Array<[number, number]> = []
  let along = 0, next = spacing
  for (let i = 1; i < route.length; i++) {
    along += haversine(route[i - 1]!, route[i]!)
    if (along < next) continue
    next = along + spacing
    let best = -1, distance = 40
    for (const node of graph.nodesNear(route[i]!, 40)) {
      if (!onRoute.has(node) || profile.blocked(node)) continue
      const d = haversine(route[i]!, graph.point(node))
      if (d < distance) { distance = d; best = node }
    }
    if (best >= 0) anchors.push([along, best])
  }
  return anchors
}

function reverseAnchors(graph: RoutingGraph, profile: Profile, guide: Set<number>, route: Coordinates[], startNode: number): number[] {
  const length = lineLength(route)
  const anchors = anchorsAlong(graph, profile, guide, route, Math.max(300, length / 12)).filter(([along]) => along > 100 && along < length - 100)
  return [startNode, ...anchors.reverse().map(([, node]) => node), startNode]
}

function reshapeAnchors(graph: RoutingGraph, profile: Profile, guide: Set<number>, route: Coordinates[], startNode: number, fixed: Fixed[]): number[] {
  const length = lineLength(route)
  const project = projector(route[0]!)
  const xy = route.map(point => project.to(point))
  const placed = fixed.map(point => {
    const [px, py] = project.to(point.point)
    let best = { along: 0, distance: Infinity }, along = 0
    for (let i = 1; i < xy.length; i++) {
      const [ax, ay] = xy[i - 1]!, [bx, by] = xy[i]!
      const segment = Math.hypot(bx - ax, by - ay)
      const hit = projectOnSegment(px, py, ax, ay, bx, by)
      if (hit.distance < best.distance) best = { along: along + hit.t * segment, distance: hit.distance }
      along += segment
    }
    return { node: point.node, along: best.along, reach: Math.max(400, best.distance * 1.5 + 200), joint: point.kind === 'joint' }
  })
  const anchors = anchorsAlong(graph, profile, guide, route, Math.max(400, length / 10))
    .filter(([along]) => along > 100 && along < length - 100)
    .filter(([along]) => !placed.some(p => p.joint && Math.abs(p.along - along) < p.reach))
    .map(([along, node]) => ({ along, node }))
  const ordered = [...anchors, ...placed].sort((a, b) => a.along - b.along).map(item => item.node)
  return [startNode, ...ordered, startNode]
}
