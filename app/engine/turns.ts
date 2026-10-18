import type { Coordinates, Turn } from '../domain/planner'
import { WAY } from './format'
import { bearing, haversine, lineLength, projectOnSegment, projector, turnAngle } from './geo'
import type { RoutingGraph } from './graph'

/**
 * The street name for a turn row. A separately mapped sidewalk takes the name of the street beside it.
 * Other unnamed ways read as "path" or "trail" depending on their tags.
 */
export function streetName(graph: RoutingGraph, halfEdge: number): string {
  const way = graph.edgeWay[halfEdge >> 1]!
  const name = graph.wayName[way]
  if (name) return name
  if (graph.wayFlags[way]! & WAY.SIDEWALK_WAY) {
    const street = besideStreet(graph, halfEdge >> 1)
    if (street) return street
  }
  return graph.wayFlags[way]! & WAY.TRAIL ? 'trail' : 'path'
}

function besideStreet(graph: RoutingGraph, edge: number): string {
  const geometry = graph.edgeGeometry[edge]!
  const middle = geometry[Math.floor(geometry.length / 2)]!
  const project = projector(middle)
  const { offsets, halfEdges } = graph.adjacency()
  let best = '', distance = 30
  for (const node of graph.nodesNear(middle, 250)) {
    for (let k = offsets[node]!; k < offsets[node + 1]!; k++) {
      const other = halfEdges[k]! >> 1
      const name = graph.wayName[graph.edgeWay[other]!]
      if (!name || (graph.wayFlags[graph.edgeWay[other]!]! & WAY.SIDEWALK_WAY)) continue
      const line = graph.edgeGeometry[other]!
      for (let s = 1; s < line.length; s++) {
        const a = project.to(line[s - 1]!), b = project.to(line[s]!)
        const d = projectOnSegment(0, 0, a[0], a[1], b[0], b[1]).distance
        if (d < distance) { distance = d; best = name }
      }
    }
  }
  return best
}

function bearingNear(points: Coordinates[], fromEnd: boolean): number {
  const line = fromEnd ? [...points].reverse() : points
  const origin = line[0]!
  let target = line[1] ?? origin
  for (let i = 1; i < line.length; i++) { target = line[i]!; if (haversine(origin, target) >= 20) break }
  return fromEnd ? bearing(target, origin) : bearing(origin, target)
}

function instruction(angle: number): Turn['instruction'] {
  const size = Math.abs(angle)
  if (size < 25) return 'straight'
  if (size < 55) return angle > 0 ? 'slight-right' : 'slight-left'
  return angle > 0 ? 'right' : 'left'
}

/** Groups the path into one row per street and names the maneuver onto each. */
export function buildTurns(graph: RoutingGraph, path: number[], routeId: string): Turn[] {
  const steps: Array<{ street: string; points: Coordinates[] }> = []
  for (const halfEdge of path) {
    const street = streetName(graph, halfEdge)
    const geometry = graph.halfEdgeGeometry(halfEdge)
    const last = steps.at(-1)
    if (last && last.street === street) last.points.push(...geometry.slice(1))
    else steps.push({ street, points: [...geometry] })
  }
  // Short connectors such as crosswalks fold into the street that follows them.
  for (let i = steps.length - 2; i > 0; i--) {
    if (lineLength(steps[i]!.points) < 25) {
      steps[i + 1]!.points.unshift(...steps[i]!.points.slice(0, -1))
      steps.splice(i, 1)
      if (steps[i - 1]!.street === steps[i]!.street) { steps[i - 1]!.points.push(...steps[i]!.points.slice(1)); steps.splice(i, 1) }
    }
  }
  return steps.map((step, i) => {
    const previous = steps[i - 1]
    const angle = previous ? turnAngle(bearingNear(previous.points, true), bearingNear(step.points, false)) : 0
    return {
      id: `${routeId}-turn-${i + 1}`, street: step.street, instruction: previous ? instruction(angle) : 'straight',
      distanceMeters: lineLength(step.points), coordinates: step.points,
    }
  })
}
