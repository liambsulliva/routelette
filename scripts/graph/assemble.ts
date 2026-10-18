/**
 * Turns routable OSM ways, their node coordinates and bicycle turn restrictions into graph tiles.
 * The build script feeds it from PBF extracts. Tests feed it from a small checked-in extract.
 */
import { tileKey } from '../../app/engine/format'
import type { TileInput, TileRestriction } from '../../app/engine/format'
import { haversine, simplify } from '../../app/engine/geo'
import type { Coordinates } from '../../app/domain/planner'
import type { PbfRelation, Tags } from './pbf'
import { deriveBarrier, deriveWay, restrictionKind } from './tags'
import { TILE_DEGREES } from './regions'
import type { RegionConfig } from './regions'

const MISSING = 0x7fffffff

export interface RawWay { id: number; refs: number[]; highway: number; flags: number; name: string }
export interface AssemblySource {
  ways: RawWay[]
  /** Sorted, unique OSM ids of every node the ways use. */
  needed: Float64Array
  /** Coordinates in 1e-7 degrees, aligned with `needed`. MISSING where the node wasn't found. */
  lon: Int32Array
  lat: Int32Array
  barrier: Uint8Array
  relations: PbfRelation[]
}

export function sortedUnique(values: Float64Array): Float64Array {
  values.sort()
  let length = 0
  for (let i = 0; i < values.length; i++) if (i === 0 || values[i] !== values[i - 1]) values[length++] = values[i]!
  return values.slice(0, length)
}

export function indexOf(sorted: Float64Array, value: number): number {
  let low = 0, high = sorted.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1, item = sorted[mid]!
    if (item === value) return mid
    if (item < value) low = mid + 1
    else high = mid - 1
  }
  return -1
}

/** Builds an assembly source from plain OSM elements, as stored in the test extract. */
export function sourceFromElements(elements: {
  nodes: Array<{ id: number; lon: number; lat: number; tags?: Tags }>
  ways: Array<{ id: number; refs: number[]; tags: Tags }>
  relations: PbfRelation[]
}): AssemblySource {
  const ways: RawWay[] = []
  for (const way of elements.ways) { const derived = deriveWay(way.tags); if (derived) ways.push({ id: way.id, refs: way.refs, ...derived }) }
  const needed = sortedUnique(Float64Array.from(ways.flatMap(way => way.refs)))
  const lon = new Int32Array(needed.length).fill(MISSING), lat = new Int32Array(needed.length).fill(MISSING), barrier = new Uint8Array(needed.length)
  for (const node of elements.nodes) {
    const index = indexOf(needed, node.id)
    if (index < 0) continue
    lon[index] = Math.round(node.lon * 1e7); lat[index] = Math.round(node.lat * 1e7)
    if (node.tags) barrier[index] = deriveBarrier(node.tags)
  }
  return { ways, needed, lon, lat, barrier, relations: elements.relations.filter(relation => restrictionKind(relation.tags) !== null) }
}

export function assembleRegion(region: RegionConfig, source: AssemblySource): { tiles: Map<string, TileInput>; stats: Record<string, number> } {
  const [west, south, east, north] = region.bounds
  const { needed, lon, lat, barrier } = source
  const ways = new Map(source.ways.map(way => [way.id, way]))
  const relations = new Map(source.relations.map(relation => [relation.id, relation]))
  const inside = (i: number) => lon[i] !== MISSING && lon[i]! / 1e7 >= west && lon[i]! / 1e7 <= east && lat[i]! / 1e7 >= south && lat[i]! / 1e7 <= north
  const kept: Array<{ way: RawWay; indexes: Int32Array }> = []
  const usage = new Uint8Array(needed.length)
  for (const way of ways.values()) {
    const indexes = Int32Array.from(way.refs, ref => indexOf(needed, ref))
    if (!indexes.some(inside)) continue
    kept.push({ way, indexes })
    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i]!
      if (lon[index] === MISSING) continue
      const end = i === 0 || i === indexes.length - 1 || lon[indexes[i - 1]!] === MISSING || lon[indexes[i + 1]!] === MISSING
      usage[index] = Math.min(255, usage[index]! + (end ? 2 : 1))
    }
  }
  const restrictionNodes = new Set<number>()
  for (const relation of relations.values()) for (const member of relation.members) if (member.type === 'node' && member.role === 'via') {
    const index = indexOf(needed, member.ref); if (index >= 0) restrictionNodes.add(index)
  }

  const junctionId = new Int32Array(needed.length).fill(-1)
  const nodes: Array<{ index: number }> = []
  const isJunction = (index: number) => usage[index]! >= 2 || barrier[index]! > 0 || restrictionNodes.has(index)
  const junction = (index: number) => {
    if (junctionId[index] === -1) { junctionId[index] = nodes.length; nodes.push({ index }) }
    return junctionId[index]!
  }
  const coordinate = (index: number): Coordinates => [lon[index]! / 1e7, lat[index]! / 1e7]

  const tiles = new Map<string, TileInput>()
  const wayIndex = new Map<string, Map<number, number>>()
  const nameIndex = new Map<string, Map<string, number>>()
  const tileFor = (key: string) => {
    let tile = tiles.get(key)
    if (!tile) {
      tile = { meta: { region: region.id, tile: key, names: [], ways: [], restrictions: [] }, nodes: [], edges: [] }
      tiles.set(key, tile); wayIndex.set(key, new Map()); nameIndex.set(key, new Map())
    }
    return tile
  }
  const localWay = (key: string, way: RawWay) => {
    const tile = tileFor(key), ways = wayIndex.get(key)!, names = nameIndex.get(key)!
    let index = ways.get(way.id)
    if (index === undefined) {
      let name = -1
      if (way.name) { name = names.get(way.name) ?? -1; if (name < 0) { name = tile.meta.names.length; tile.meta.names.push(way.name); names.set(way.name, name) } }
      index = tile.meta.ways.length; tile.meta.ways.push([way.id, way.flags, way.highway, name]); ways.set(way.id, index)
    }
    return index
  }

  let edgeCount = 0, pointCount = 0
  for (const { way, indexes } of kept) {
    let segment: number[] = []
    const flush = () => {
      if (segment.length >= 2) {
        const geometry = segment.map(coordinate)
        const length = geometry.reduce((sum, point, i) => i ? sum + haversine(geometry[i - 1]!, point) : 0, 0)
        if (length > 0.05) {
          const a = junction(segment[0]!), b = junction(segment.at(-1)!)
          const key = tileKey(region.id, geometry[0]![0], geometry[0]![1], TILE_DEGREES)
          const simplified = simplify(geometry, 1)
          tileFor(key).edges.push({ a, b, way: localWay(key, way), length, geometry: simplified })
          edgeCount++; pointCount += simplified.length
        }
      }
      segment = []
    }
    for (const index of indexes) {
      if (index < 0 || lon[index] === MISSING) { flush(); continue }
      segment.push(index)
      if (segment.length > 1 && isJunction(index)) { flush(); segment.push(index) }
    }
    flush()
  }

  for (const [id, { index }] of nodes.entries()) {
    const [x, y] = coordinate(index)
    tileFor(tileKey(region.id, x, y, TILE_DEGREES)).nodes.push({ id, lon: x, lat: y, flags: barrier[index]! })
  }

  // Restrictions are stored in the tile of the junction where the restricted turn happens.
  const wayRefs = new Map<number, number[]>()
  for (const { way } of kept) wayRefs.set(way.id, way.refs)
  let restrictionCount = 0
  for (const relation of relations.values()) {
    const kind = restrictionKind(relation.tags)!
    const from = relation.members.find(m => m.type === 'way' && m.role === 'from')
    const to = relation.members.find(m => m.type === 'way' && m.role === 'to')
    const vias = relation.members.filter(m => m.role === 'via')
    if (!from || !to || !vias.length || !wayRefs.has(from.ref) || !wayRefs.has(to.ref)) continue
    let node = -1, last = from.ref, before: number[] = []
    if (vias.length === 1 && vias[0]!.type === 'node') {
      node = indexOf(needed, vias[0]!.ref)
    } else if (vias.every(m => m.type === 'way') && vias.every(m => wayRefs.has(m.ref))) {
      const lastVia = wayRefs.get(vias.at(-1)!.ref)!, target = wayRefs.get(to.ref)!
      const shared = [lastVia[0], lastVia.at(-1)].find(ref => ref === target[0] || ref === target.at(-1))
      if (shared === undefined) continue
      node = indexOf(needed, shared)
      last = vias.at(-1)!.ref
      before = [...vias.slice(0, -1).map(m => m.ref).reverse(), from.ref]
    } else continue
    if (node < 0 || junctionId[node] === -1) continue
    const restriction: TileRestriction = { kind, node: junctionId[node]!, from: last, before, to: to.ref }
    tileFor(tileKey(region.id, lon[node]! / 1e7, lat[node]! / 1e7, TILE_DEGREES)).meta.restrictions.push(restriction)
    restrictionCount++
  }

  return { tiles, stats: { ways: kept.length, nodes: nodes.length, edges: edgeCount, points: pointCount, restrictions: restrictionCount } }
}
