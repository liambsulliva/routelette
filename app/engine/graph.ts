import type { Coordinates } from '../domain/planner'
import { COORDINATE_SCALE } from './format'
import type { DecodedTile, TileRestriction } from './format'
import { haversine, projectOnSegment, projector } from './geo'

/**
 * A routing graph for one planning request, joined from the decoded tiles around it.
 * Half-edge h runs along edge h >> 1, forward (a to b) when h is even.
 */
export interface Restriction { kind: 0 | 1; from: number; before: number[]; to: number }

export class RoutingGraph {
  nodeCount = 0
  lon: number[] = []
  lat: number[] = []
  nodeFlags: number[] = []
  edgeA: number[] = []
  edgeB: number[] = []
  edgeWay: number[] = []
  edgeLength: number[] = []
  /** The tile edge an edge was split from, so overlap penalties treat both pieces as one road. */
  edgeOrigin: number[] = []
  edgeGeometry: Coordinates[][] = []
  wayOsm: number[] = []
  wayFlags: number[] = []
  wayHighway: number[] = []
  wayName: string[] = []
  restrictions = new Map<number, Restriction[]>()
  private nodeIndex = new Map<number, number>()
  private csr: { offsets: Uint32Array; halfEdges: Uint32Array } | null = null
  private nodeGrid: Map<number, number[]> | null = null

  static fromTiles(tiles: DecodedTile[]): RoutingGraph {
    const graph = new RoutingGraph()
    for (const tile of tiles) {
      for (let i = 0; i < tile.nodeIds.length; i++) {
        const local = graph.node(tile.nodeIds[i]!, tile.nodeLon[i]! / COORDINATE_SCALE, tile.nodeLat[i]! / COORDINATE_SCALE)
        graph.nodeFlags[local] = tile.nodeFlags[i]!
      }
    }
    for (const tile of tiles) {
      const wayBase = graph.wayOsm.length
      for (const [osmId, flags, highway, name] of tile.meta.ways) {
        graph.wayOsm.push(osmId); graph.wayFlags.push(flags); graph.wayHighway.push(highway)
        graph.wayName.push(name >= 0 ? tile.meta.names[name] ?? '' : '')
      }
      for (let e = 0; e < tile.edgeA.length; e++) {
        const start = tile.edgeGeometryStart[e]!, end = tile.edgeGeometryStart[e + 1]!
        const geometry: Coordinates[] = []
        for (let p = start; p < end; p++) geometry.push([tile.geometry[p * 2]! / COORDINATE_SCALE, tile.geometry[p * 2 + 1]! / COORDINATE_SCALE])
        const a = graph.node(tile.edgeA[e]!, geometry[0]![0], geometry[0]![1])
        const b = graph.node(tile.edgeB[e]!, geometry.at(-1)![0], geometry.at(-1)![1])
        graph.addEdge(a, b, wayBase + tile.edgeWay[e]!, tile.edgeLength[e]!, geometry)
      }
      for (const restriction of tile.meta.restrictions) graph.addRestriction(restriction)
    }
    return graph
  }

  private node(globalId: number, lon: number, lat: number): number {
    let local = this.nodeIndex.get(globalId)
    if (local === undefined) {
      local = this.addNode([lon, lat])
      this.nodeIndex.set(globalId, local)
    }
    return local
  }

  private addRestriction(restriction: TileRestriction) {
    const local = this.nodeIndex.get(restriction.node)
    if (local === undefined) return
    const list = this.restrictions.get(local) ?? []
    list.push({ kind: restriction.kind, from: restriction.from, before: restriction.before, to: restriction.to })
    this.restrictions.set(local, list)
  }

  addNode(point: Coordinates, flags = 0): number {
    this.lon.push(point[0]); this.lat.push(point[1]); this.nodeFlags.push(flags)
    this.csr = null; this.nodeGrid = null
    return this.nodeCount++
  }

  addEdge(a: number, b: number, way: number, length: number, geometry: Coordinates[], origin = this.edgeA.length): number {
    this.edgeA.push(a); this.edgeB.push(b); this.edgeWay.push(way); this.edgeLength.push(length)
    this.edgeGeometry.push(geometry); this.edgeOrigin.push(origin)
    this.csr = null
    return this.edgeA.length - 1
  }

  get edgeCount() { return this.edgeA.length }
  point(node: number): Coordinates { return [this.lon[node]!, this.lat[node]!] }
  tail(halfEdge: number) { const e = halfEdge >> 1; return halfEdge & 1 ? this.edgeB[e]! : this.edgeA[e]! }
  head(halfEdge: number) { const e = halfEdge >> 1; return halfEdge & 1 ? this.edgeA[e]! : this.edgeB[e]! }
  halfEdgeGeometry(halfEdge: number): Coordinates[] {
    const geometry = this.edgeGeometry[halfEdge >> 1]!
    return halfEdge & 1 ? [...geometry].reverse() : geometry
  }

  /** Outgoing half-edges per node, rebuilt after any change. */
  adjacency() {
    if (this.csr) return this.csr
    const offsets = new Uint32Array(this.nodeCount + 1)
    const edges = this.edgeA.length
    for (let e = 0; e < edges; e++) { offsets[this.edgeA[e]! + 1]!++; offsets[this.edgeB[e]! + 1]!++ }
    for (let i = 0; i < this.nodeCount; i++) offsets[i + 1]! += offsets[i]!
    const fill = offsets.slice(0, this.nodeCount)
    const halfEdges = new Uint32Array(edges * 2)
    for (let e = 0; e < edges; e++) { halfEdges[fill[this.edgeA[e]!]!++] = e * 2; halfEdges[fill[this.edgeB[e]!]!++] = e * 2 + 1 }
    this.csr = { offsets, halfEdges }
    return this.csr
  }

  /** Nodes bucketed into roughly 250 m cells for corner lookups. */
  private grid() {
    if (this.nodeGrid) return this.nodeGrid
    const grid = new Map<number, number[]>()
    for (let i = 0; i < this.nodeCount; i++) {
      const key = cellKey(this.lon[i]!, this.lat[i]!)
      const cell = grid.get(key); if (cell) cell.push(i); else grid.set(key, [i])
    }
    this.nodeGrid = grid
    return grid
  }

  nodesNear(point: Coordinates, radiusMeters: number): number[] {
    const grid = this.grid(), reach = Math.ceil(radiusMeters / 250) + 1
    const cx = Math.floor(point[0] / CELL), cy = Math.floor(point[1] / CELL)
    const result: number[] = []
    for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) {
      const cell = grid.get((cx + dx) * 100003 + (cy + dy))
      if (cell) for (const node of cell) if (haversine(point, this.point(node)) <= radiusMeters) result.push(node)
    }
    return result
  }

  /**
   * Splits the nearest usable edge at the point closest to `point` and returns the new node.
   * `usable(edge)` decides which edges count. Returns null when nothing is within `maxMeters`.
   */
  snapToEdge(point: Coordinates, maxMeters: number, usable: (edge: number) => boolean): { node: number; distance: number } | null {
    const project = projector(point)
    let best = { edge: -1, segment: 0, t: 0, distance: maxMeters, x: 0, y: 0 }
    const degreeX = maxMeters / project.kx, degreeY = maxMeters / project.ky
    for (let e = 0; e < this.edgeA.length; e++) {
      const geometry = this.edgeGeometry[e]!
      const first = geometry[0]!
      if (Math.abs(first[0] - point[0]) > degreeX + 0.03 || Math.abs(first[1] - point[1]) > degreeY + 0.03) continue
      if (!usable(e)) continue
      for (let s = 1; s < geometry.length; s++) {
        const a = project.to(geometry[s - 1]!), b = project.to(geometry[s]!)
        const hit = projectOnSegment(0, 0, a[0], a[1], b[0], b[1])
        if (hit.distance < best.distance) best = { edge: e, segment: s, t: hit.t, distance: hit.distance, x: hit.x, y: hit.y }
      }
    }
    if (best.edge < 0) return null
    const e = best.edge, geometry = this.edgeGeometry[e]!
    const snapped = project.from(best.x, best.y)
    const firstPart = [...geometry.slice(0, best.segment), snapped]
    const secondPart = [snapped, ...geometry.slice(best.segment)]
    const total = this.edgeLength[e]!, firstLength = lineLengthOf(firstPart)
    const node = this.addNode(snapped)
    const origin = this.edgeOrigin[e]!
    this.addEdge(this.edgeA[e]!, node, this.edgeWay[e]!, Math.min(total, firstLength), firstPart, origin)
    this.addEdge(node, this.edgeB[e]!, this.edgeWay[e]!, Math.max(0.01, total - firstLength), secondPart, origin)
    return { node, distance: best.distance }
  }
}

const CELL = 0.003
function cellKey(lon: number, lat: number) { return Math.floor(lon / CELL) * 100003 + Math.floor(lat / CELL) }
function lineLengthOf(points: Coordinates[]) { let total = 0; for (let i = 1; i < points.length; i++) total += haversine(points[i - 1]!, points[i]!); return total }
