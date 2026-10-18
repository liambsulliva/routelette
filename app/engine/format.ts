/**
 * Binary layout of one graph tile. The build script writes it and the planner worker reads it.
 *
 * Header (6 × u32): magic, format version, node count, edge count, geometry point count, JSON byte length.
 * Then UTF-8 JSON metadata, zero-padded to 4 bytes, then these little-endian arrays in order:
 * node ids u32, node lon i32, node lat i32, node flags u32,
 * edge a u32, edge b u32, edge way u32, edge length f32, edge geometry start u32 (edges + 1 entries),
 * geometry lon/lat i32 pairs.
 *
 * Coordinates are integers in units of 1e-7 degrees. Node ids are global within a region and snapshot version.
 */

export const TILE_MAGIC = 0x544c5452 // "RTLT"
export const TILE_FORMAT_VERSION = 1
export const COORDINATE_SCALE = 1e7

export const HIGHWAYS = [
  'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential',
  'living_street', 'service', 'road', 'track', 'path', 'footway', 'pedestrian', 'cycleway', 'steps', 'bridleway', 'busway', 'other',
] as const
export type Highway = typeof HIGHWAYS[number]

/** Way flags, derived from OSM tags at build time. */
export const WAY = {
  FOOT_FORWARD: 1 << 0,
  FOOT_BACKWARD: 1 << 1,
  BIKE_FORWARD: 1 << 2,
  BIKE_BACKWARD: 1 << 3,
  SIDEWALK: 1 << 4,
  NO_SIDEWALK: 1 << 5,
  FOOT_PATH: 1 << 6,
  CYCLE_TRACK: 1 << 7,
  CYCLE_LANE: 1 << 8,
  CYCLE_SHARED: 1 << 9,
  CYCLEWAY_TAGGED: 1 << 10,
  UNPAVED: 1 << 11,
  PAVED: 1 << 12,
  FAST: 1 << 13,
  WIDE: 1 << 14,
  LIT: 1 << 15,
  MINOR_SERVICE: 1 << 16,
  TRAIL: 1 << 17,
  SIDEWALK_WAY: 1 << 18,
} as const

/** Node flags for barriers. */
export const NODE = {
  FOOT_BLOCKED: 1 << 0,
  BIKE_BLOCKED: 1 << 1,
} as const

/** A turn restriction that applies to bicycles, keyed by the junction where the restricted turn happens. */
export interface TileRestriction {
  /** 0 means "no turn", 1 means "only this turn". */
  kind: 0 | 1
  /** Global id of the junction node where the turn happens. */
  node: number
  /** OSM id of the way the turn leaves from. For via-way restrictions this is the last via way. */
  from: number
  /** OSM ids of the ways travelled before `from`, nearest first. Empty for via-node restrictions. */
  before: number[]
  /** OSM id of the way the turn enters. */
  to: number
}

export interface TileWay { osmId: number; flags: number; highway: number; name: number }

export interface TileMetadata {
  region: string
  tile: string
  names: string[]
  ways: Array<[osmId: number, flags: number, highway: number, name: number]>
  restrictions: TileRestriction[]
}

export interface DecodedTile {
  meta: TileMetadata
  nodeIds: Uint32Array
  nodeLon: Int32Array
  nodeLat: Int32Array
  nodeFlags: Uint32Array
  edgeA: Uint32Array
  edgeB: Uint32Array
  edgeWay: Uint32Array
  edgeLength: Float32Array
  edgeGeometryStart: Uint32Array
  geometry: Int32Array
}

export interface TileInput {
  meta: TileMetadata
  nodes: Array<{ id: number; lon: number; lat: number; flags: number }>
  edges: Array<{ a: number; b: number; way: number; length: number; geometry: Array<[number, number]> }>
}

export function encodeTile(input: TileInput): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(input.meta))
  const jsonPadded = Math.ceil(json.length / 4) * 4
  const n = input.nodes.length, e = input.edges.length
  const points = input.edges.reduce((sum, edge) => sum + edge.geometry.length, 0)
  const words = 6 + jsonPadded / 4 + n * 4 + e * 4 + (e + 1) + points * 2
  const buffer = new ArrayBuffer(words * 4)
  const header = new Uint32Array(buffer, 0, 6)
  header.set([TILE_MAGIC, TILE_FORMAT_VERSION, n, e, points, json.length])
  new Uint8Array(buffer, 24, json.length).set(json)
  let offset = 24 + jsonPadded
  const u32 = (length: number) => { const view = new Uint32Array(buffer, offset, length); offset += length * 4; return view }
  const i32 = (length: number) => { const view = new Int32Array(buffer, offset, length); offset += length * 4; return view }
  const f32 = (length: number) => { const view = new Float32Array(buffer, offset, length); offset += length * 4; return view }
  const ids = u32(n), lon = i32(n), lat = i32(n), flags = u32(n)
  input.nodes.forEach((node, i) => { ids[i] = node.id; lon[i] = Math.round(node.lon * COORDINATE_SCALE); lat[i] = Math.round(node.lat * COORDINATE_SCALE); flags[i] = node.flags })
  const a = u32(e), b = u32(e), way = u32(e), length = f32(e), start = u32(e + 1)
  const geometry = i32(points * 2)
  let cursor = 0
  input.edges.forEach((edge, i) => {
    a[i] = edge.a; b[i] = edge.b; way[i] = edge.way; length[i] = edge.length; start[i] = cursor
    for (const [x, y] of edge.geometry) { geometry[cursor * 2] = Math.round(x * COORDINATE_SCALE); geometry[cursor * 2 + 1] = Math.round(y * COORDINATE_SCALE); cursor++ }
  })
  start[e] = cursor
  return new Uint8Array(buffer)
}

export function decodeTile(data: ArrayBuffer): DecodedTile {
  const header = new Uint32Array(data, 0, 6)
  if (header[0] !== TILE_MAGIC || header[1] !== TILE_FORMAT_VERSION) throw new Error('Routing tile format is not supported.')
  const n = header[2]!, e = header[3]!, points = header[4]!, jsonLength = header[5]!
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 24, jsonLength))) as TileMetadata
  let offset = 24 + Math.ceil(jsonLength / 4) * 4
  const u32 = (length: number) => { const view = new Uint32Array(data, offset, length); offset += length * 4; return view }
  const i32 = (length: number) => { const view = new Int32Array(data, offset, length); offset += length * 4; return view }
  const f32 = (length: number) => { const view = new Float32Array(data, offset, length); offset += length * 4; return view }
  return {
    meta,
    nodeIds: u32(n), nodeLon: i32(n), nodeLat: i32(n), nodeFlags: u32(n),
    edgeA: u32(e), edgeB: u32(e), edgeWay: u32(e), edgeLength: f32(e), edgeGeometryStart: u32(e + 1),
    geometry: i32(points * 2),
  }
}

export function tileKey(region: string, lon: number, lat: number, degrees: number): string {
  return `${region}-${Math.floor(lon / degrees)}-${Math.floor(lat / degrees)}`
}
