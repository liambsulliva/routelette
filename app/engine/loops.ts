import type { Coordinates } from '../domain/planner'
import { haversine, polygonArea } from './geo'
import type { RoutingGraph } from './graph'
import type { Profile } from './profile'
import type { PathFinder } from './search'

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pathLength(graph: RoutingGraph, path: number[]): number {
  let total = 0
  for (const halfEdge of path) total += graph.edgeLength[halfEdge >> 1]!
  return total
}

export function pathCost(profile: Profile, path: number[]): number {
  let total = 0
  for (const halfEdge of path) total += profile.cost[halfEdge]!
  return total
}

export function pathNodes(graph: RoutingGraph, path: number[]): number[] {
  if (!path.length) return []
  return [graph.tail(path[0]!), ...path.map(halfEdge => graph.head(halfEdge))]
}

export function pathCoordinates(graph: RoutingGraph, path: number[]): Coordinates[] {
  const points: Coordinates[] = []
  for (const halfEdge of path) {
    const geometry = graph.halfEdgeGeometry(halfEdge)
    points.push(...(points.length ? geometry.slice(1) : geometry))
  }
  return points
}

/** Routes through every node in order. Each leg makes roads used by earlier legs more expensive. */
export function routeThrough(graph: RoutingGraph, finder: PathFinder, nodes: number[], penalize = true): number[] | null {
  const used = penalize ? new Set<number>() : undefined
  const path: number[] = []
  for (let i = 1; i < nodes.length; i++) {
    const leg = finder.find(nodes[i - 1]!, nodes[i]!, used)
    if (!leg) return null
    for (const halfEdge of leg) { path.push(halfEdge); used?.add(graph.edgeOrigin[halfEdge >> 1]!) }
  }
  return path
}

/**
 * Removes out-and-back stretches: a part of the path that leaves a node and comes back to it
 * while enclosing almost no area. Parts that pass a required node stay.
 */
export function removeSpurs(graph: RoutingGraph, path: number[], required: Set<number>): number[] {
  let current = path
  for (let pass = 0; pass < 8; pass++) {
    const nodes = pathNodes(graph, current)
    const total = pathLength(graph, current)
    const seen = new Map<number, number>()
    let cut: [number, number] | null = null
    let sinceRequired = new Map<number, boolean>()
    for (let j = 0; j < nodes.length && !cut; j++) {
      const node = nodes[j]!
      const i = seen.get(node)
      if (i !== undefined && !(i === 0 && j === nodes.length - 1) && !sinceRequired.get(node)) {
        const piece = current.slice(i, j)
        const length = pathLength(graph, piece)
        if (length > 0 && length < total * 0.6) {
          const area = polygonArea(pathCoordinates(graph, piece))
          if (area < length * 20) cut = [i, j]
        }
      }
      if (required.has(node) && j > 0) for (const key of seen.keys()) sinceRequired.set(key, true)
      seen.set(node, j)
      sinceRequired.set(node, false)
    }
    if (!cut) break
    current = [...current.slice(0, cut[0]), ...current.slice(cut[1])]
  }
  return current
}

/**
 * Removes out-and-back stretches that return on a parallel way, such as up one sidewalk and back down
 * the other. The path is bridged between the two ends when a short connection exists.
 */
export function removeParallelSpurs(graph: RoutingGraph, finder: PathFinder, path: number[], required: Set<number>): number[] {
  let current = path
  for (let pass = 0; pass < 6; pass++) {
    const nodes = pathNodes(graph, current)
    if (nodes.length < 4) return current
    const along = [0]
    for (const halfEdge of current) along.push(along.at(-1)! + graph.edgeLength[halfEdge >> 1]!)
    const total = along.at(-1)!
    const requiredBefore = [0]
    for (let k = 0; k < nodes.length; k++) requiredBefore.push(requiredBefore[k]! + (required.has(nodes[k]!) && k > 0 && k < nodes.length - 1 ? 1 : 0))
    const cell = 0.0004
    const grid = new Map<string, number[]>()
    let replaced = false
    for (let j = 0; j < nodes.length && !replaced; j++) {
      const [x, y] = graph.point(nodes[j]!)
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell)
      let first = -1
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const i of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const length = along[j]! - along[i]!
          if (length < 60 || length > total * 0.4) continue
          if (requiredBefore[j]! - requiredBefore[i + 1]! > 0) continue
          if (haversine(graph.point(nodes[i]!), graph.point(nodes[j]!)) > 30) continue
          if (first < 0 || i < first) first = i
        }
      }
      const key = `${cx},${cy}`
      const list = grid.get(key); if (list) list.push(j); else grid.set(key, [j])
      if (first < 0) continue
      const piece = current.slice(first, j)
      const length = along[j]! - along[first]!
      if (polygonArea(pathCoordinates(graph, piece)) >= length * 20) continue
      const bridge = finder.find(nodes[first]!, nodes[j]!)
      if (!bridge || pathLength(graph, bridge) > length * 0.3) continue
      current = [...current.slice(0, first), ...bridge, ...current.slice(j)]
      replaced = true
    }
    if (!replaced) break
  }
  return current
}

/** Length travelled on roads this path already used. */
export function repeatedLength(graph: RoutingGraph, path: number[]): number {
  const seen = new Set<number>()
  let repeated = 0
  for (const halfEdge of path) {
    const origin = graph.edgeOrigin[halfEdge >> 1]!
    if (seen.has(origin)) repeated += graph.edgeLength[halfEdge >> 1]!
    seen.add(origin)
  }
  return repeated
}

export function edgeLengths(graph: RoutingGraph, path: number[]): Map<number, number> {
  const lengths = new Map<number, number>()
  for (const halfEdge of path) {
    const origin = graph.edgeOrigin[halfEdge >> 1]!
    lengths.set(origin, Math.max(lengths.get(origin) ?? 0, graph.edgeLength[halfEdge >> 1]!))
  }
  return lengths
}

/** Shared road length as a fraction of the shorter route. */
export function overlap(a: Map<number, number>, b: Map<number, number>): number {
  let shared = 0, totalA = 0, totalB = 0
  for (const [edge, length] of a) { totalA += length; if (b.has(edge)) shared += length }
  for (const length of b.values()) totalB += length
  return shared / Math.max(1, Math.min(totalA, totalB))
}

/** Nodes that can be passed in this mode with at least `minimum` usable connections. */
export function usableDegree(graph: RoutingGraph, profile: Profile): Uint8Array {
  const degree = new Uint8Array(graph.nodeCount)
  for (let e = 0; e < graph.edgeCount; e++) {
    if (profile.cost[e * 2] === Infinity && profile.cost[e * 2 + 1] === Infinity) continue
    const a = graph.edgeA[e]!, b = graph.edgeB[e]!
    if (degree[a]! < 255) degree[a]!++
    if (degree[b]! < 255) degree[b]!++
  }
  return degree
}
