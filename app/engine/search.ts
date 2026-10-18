import { projector } from './geo'
import type { RoutingGraph } from './graph'
import type { Profile } from './profile'

class Heap {
  private keys: number[] = []
  private values: number[] = []
  get size() { return this.keys.length }
  push(key: number, value: number) {
    const keys = this.keys, values = this.values
    let i = keys.length
    keys.push(key); values.push(value)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (keys[parent]! <= key) break
      keys[i] = keys[parent]!; values[i] = values[parent]!; i = parent
    }
    keys[i] = key; values[i] = value
  }
  pop(): number {
    const keys = this.keys, values = this.values
    const top = values[0]!
    const lastKey = keys.pop()!, lastValue = values.pop()!
    if (keys.length) {
      let i = 0
      const n = keys.length
      while (true) {
        let child = i * 2 + 1
        if (child >= n) break
        if (child + 1 < n && keys[child + 1]! < keys[child]!) child++
        if (keys[child]! >= lastKey) break
        keys[i] = keys[child]!; values[i] = values[child]!; i = child
      }
      keys[i] = lastKey; values[i] = lastValue
    }
    return top
  }
  clear() { this.keys.length = 0; this.values.length = 0 }
}

/**
 * A* over the graph. Junctions with bicycle turn restrictions get one search state per incoming
 * half-edge, so "no turn" and "only turn" rules are exact there. Elsewhere a state is a node.
 */
export class PathFinder {
  private readonly n: number
  private readonly dist: Float64Array
  private readonly parent: Int32Array
  private readonly via: Int32Array
  private readonly stamp: Uint32Array
  private generation = 0
  private readonly heap = new Heap()
  private readonly project
  readonly adjacency

  constructor(private graph: RoutingGraph, private profile: Profile) {
    this.n = graph.nodeCount
    const states = this.n + graph.edgeCount * 2
    this.dist = new Float64Array(states)
    this.parent = new Int32Array(states)
    this.via = new Int32Array(states)
    this.stamp = new Uint32Array(states)
    this.adjacency = graph.adjacency()
    this.project = projector(graph.point(0))
  }

  /** Returns the half-edges from `from` to `to`, or null. `used` makes already travelled roads cost three times as much. */
  find(from: number, to: number, used?: Set<number>, maxCost = Infinity): number[] | null {
    if (from === to) return []
    const { graph, profile, dist, parent, via, stamp, heap, n } = this
    const { offsets, halfEdges } = this.adjacency
    const generation = ++this.generation
    heap.clear()
    const tx = graph.lon[to]! * this.project.kx, ty = graph.lat[to]! * this.project.ky
    const kx = this.project.kx, ky = this.project.ky, ratio = profile.minRatio
    const h = (node: number) => Math.hypot(graph.lon[node]! * kx - tx, graph.lat[node]! * ky - ty) * ratio
    const restrictions = profile.restricted ? graph.restrictions : null
    const stateFor = (node: number, halfEdge: number) => restrictions?.has(node) ? n + halfEdge : node

    const start = from
    stamp[start] = generation; dist[start] = 0; parent[start] = -1; via[start] = -1
    heap.push(h(from), start)
    let goal = -1
    while (heap.size) {
      const state = heap.pop()
      const g = dist[state]!
      const node = state < n ? state : graph.head(state - n)
      if (node === to) { goal = state; break }
      if (g > maxCost) break
      const incoming = via[state]!
      const rules = restrictions && incoming >= 0 ? restrictions.get(node) : undefined
      for (let k = offsets[node]!; k < offsets[node + 1]!; k++) {
        const halfEdge = halfEdges[k]!
        let c = profile.cost[halfEdge]!
        if (c === Infinity) continue
        if (incoming >= 0 && (incoming >> 1) === (halfEdge >> 1)) continue
        const next = graph.head(halfEdge)
        if (next !== to && profile.blocked(next)) continue
        if (rules && this.forbidden(rules, incoming, halfEdge, state)) continue
        if (used?.has(graph.edgeOrigin[halfEdge >> 1]!)) c *= 3
        const target = stateFor(next, halfEdge)
        const candidate = g + c
        if (stamp[target] === generation && candidate >= dist[target]!) continue
        stamp[target] = generation; dist[target] = candidate; parent[target] = state; via[target] = halfEdge
        heap.push(candidate + h(next), target)
      }
    }
    if (goal < 0) return null
    const path: number[] = []
    for (let state = goal; via[state]! >= 0; state = parent[state]!) path.push(via[state]!)
    return path.reverse()
  }

  /** Whether turning from `incoming` onto `outgoing` breaks a restriction at this junction. */
  private forbidden(rules: Array<{ kind: 0 | 1; from: number; before: number[]; to: number }>, incoming: number, outgoing: number, state: number): boolean {
    const graph = this.graph
    const fromWay = graph.wayOsm[graph.edgeWay[incoming >> 1]!]!, toWay = graph.wayOsm[graph.edgeWay[outgoing >> 1]!]!
    for (const rule of rules) {
      if (rule.from !== fromWay) continue
      if (rule.before.length && !this.matchesHistory(rule.before, fromWay, state)) continue
      if (rule.kind === 0 && rule.to === toWay) return true
      if (rule.kind === 1 && rule.to !== toWay) return true
    }
    return false
  }

  private matchesHistory(before: number[], current: number, state: number): boolean {
    const graph = this.graph
    let index = 0, previous = current
    for (let s = this.parent[state]!; s >= 0 && index < before.length; s = this.parent[s]!) {
      const halfEdge = this.via[s]!
      if (halfEdge < 0) break
      const way = graph.wayOsm[graph.edgeWay[halfEdge >> 1]!]!
      if (way === previous) continue
      if (way !== before[index]) return false
      previous = way; index++
    }
    return index === before.length
  }
}
