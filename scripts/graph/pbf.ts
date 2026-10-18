/**
 * A small reader for OSM PBF files (https://wiki.openstreetmap.org/wiki/PBF_Format).
 * It decodes dense nodes, ways and relations block by block and hands each element to a callback.
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import Pbf from 'pbf'

export type Tags = Record<string, string>
export interface PbfNode { id: number; lon: number; lat: number; tags: Tags | null }
export interface PbfWay { id: number; refs: number[]; tags: Tags }
export interface PbfMember { type: 'node' | 'way' | 'relation'; ref: number; role: string }
export interface PbfRelation { id: number; members: PbfMember[]; tags: Tags }
export interface PbfHandlers {
  node?(node: PbfNode): void
  way?(way: PbfWay): void
  relation?(relation: PbfRelation): void
  /** Return false to skip decoding node blocks, which saves most of the parsing time on a ways-only pass. */
  wantNodes?: boolean
  wantNodeTags?: boolean
}
export interface PbfHeader { replicationTimestamp: number | null }

interface Block {
  strings: string[]
  granularity: number
  latOffset: number
  lonOffset: number
}

function readBlob(data: Uint8Array): Uint8Array {
  let raw: Uint8Array | null = null, zlib: Uint8Array | null = null
  new Pbf(data).readFields((tag, _, pbf) => {
    if (tag === 1) raw = pbf.readBytes()
    else if (tag === 3) zlib = pbf.readBytes()
  }, null)
  if (raw) return raw
  if (zlib) return inflateSync(zlib)
  throw new Error('Unsupported PBF blob compression.')
}

function tagsFrom(keys: number[], values: number[], strings: string[]): Tags {
  const tags: Tags = {}
  for (let i = 0; i < keys.length; i++) tags[strings[keys[i]!]!] = strings[values[i]!]!
  return tags
}

function readDense(pbf: Pbf, end: number, block: Block, handlers: PbfHandlers) {
  let ids: number[] = [], lats: number[] = [], lons: number[] = [], keysVals: number[] = []
  pbf.readFields((tag, _, p) => {
    if (tag === 1) ids = p.readPackedSVarint()
    else if (tag === 8) lats = p.readPackedSVarint()
    else if (tag === 9) lons = p.readPackedSVarint()
    else if (tag === 10 && handlers.wantNodeTags) keysVals = p.readPackedVarint()
  }, null, end)
  let id = 0, lat = 0, lon = 0, cursor = 0
  for (let i = 0; i < ids.length; i++) {
    id += ids[i]!; lat += lats[i]!; lon += lons[i]!
    let tags: Tags | null = null
    if (keysVals.length) {
      while (cursor < keysVals.length && keysVals[cursor] !== 0) {
        tags ??= {}
        tags[block.strings[keysVals[cursor]!]!] = block.strings[keysVals[cursor + 1]!]!
        cursor += 2
      }
      cursor++
    }
    handlers.node!({ id, lat: (block.latOffset + block.granularity * lat) / 1e9, lon: (block.lonOffset + block.granularity * lon) / 1e9, tags })
  }
}

function readGroup(pbf: Pbf, end: number, block: Block, handlers: PbfHandlers) {
  pbf.readFields((tag, _, p) => {
    if (tag === 2 && handlers.node && handlers.wantNodes !== false) {
      readDense(p, p.readVarint() + p.pos, block, handlers)
    } else if (tag === 1 && handlers.node && handlers.wantNodes !== false) {
      const nodeEnd = p.readVarint() + p.pos
      let id = 0, lat = 0, lon = 0, keys: number[] = [], values: number[] = []
      p.readFields((t, __, q) => {
        if (t === 1) id = q.readSVarint()
        else if (t === 2) keys = q.readPackedVarint()
        else if (t === 3) values = q.readPackedVarint()
        else if (t === 8) lat = q.readSVarint()
        else if (t === 9) lon = q.readSVarint()
      }, null, nodeEnd)
      handlers.node({ id, lat: (block.latOffset + block.granularity * lat) / 1e9, lon: (block.lonOffset + block.granularity * lon) / 1e9, tags: keys.length ? tagsFrom(keys, values, block.strings) : null })
    } else if (tag === 3 && handlers.way) {
      const wayEnd = p.readVarint() + p.pos
      let id = 0, keys: number[] = [], values: number[] = [], deltas: number[] = []
      p.readFields((t, __, q) => {
        if (t === 1) id = q.readVarint()
        else if (t === 2) keys = q.readPackedVarint()
        else if (t === 3) values = q.readPackedVarint()
        else if (t === 8) deltas = q.readPackedSVarint()
      }, null, wayEnd)
      let ref = 0
      const refs = deltas.map(delta => (ref += delta))
      handlers.way({ id, refs, tags: tagsFrom(keys, values, block.strings) })
    } else if (tag === 4 && handlers.relation) {
      const relationEnd = p.readVarint() + p.pos
      let id = 0, keys: number[] = [], values: number[] = [], roles: number[] = [], ids: number[] = [], types: number[] = []
      p.readFields((t, __, q) => {
        if (t === 1) id = q.readVarint()
        else if (t === 2) keys = q.readPackedVarint()
        else if (t === 3) values = q.readPackedVarint()
        else if (t === 8) roles = q.readPackedVarint()
        else if (t === 9) ids = q.readPackedSVarint()
        else if (t === 10) types = q.readPackedVarint()
      }, null, relationEnd)
      let ref = 0
      const members = ids.map((delta, i): PbfMember => ({ type: types[i] === 0 ? 'node' : types[i] === 1 ? 'way' : 'relation', ref: (ref += delta), role: block.strings[roles[i]!] ?? '' }))
      handlers.relation({ id, members, tags: tagsFrom(keys, values, block.strings) })
    }
  }, null, end)
}

function readPrimitiveBlock(data: Uint8Array, handlers: PbfHandlers) {
  const pbf = new Pbf(data)
  const block: Block = { strings: [], granularity: 100, latOffset: 0, lonOffset: 0 }
  const groups: Array<[number, number]> = []
  pbf.readFields((tag, _, p) => {
    if (tag === 1) {
      const end = p.readVarint() + p.pos
      p.readFields((t, __, q) => { if (t === 1) block.strings.push(q.readString()) }, null, end)
    } else if (tag === 2) {
      const length = p.readVarint(); groups.push([p.pos, p.pos + length]); p.pos += length
    } else if (tag === 17) block.granularity = p.readVarint()
    else if (tag === 19) block.latOffset = p.readSVarint()
    else if (tag === 20) block.lonOffset = p.readSVarint()
  }, null)
  for (const [start, end] of groups) { pbf.pos = start; readGroup(pbf, end, block, handlers) }
}

function readHeaderBlock(data: Uint8Array): PbfHeader {
  let replicationTimestamp: number | null = null
  new Pbf(data).readFields((tag, _, p) => { if (tag === 32) replicationTimestamp = p.readVarint() }, null)
  return { replicationTimestamp }
}

/** Reads a whole PBF file. Geofabrik extracts are under 500 MB, which fits in memory. */
export function readPbf(path: string, handlers: PbfHandlers): PbfHeader {
  const file = readFileSync(path)
  const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength)
  let offset = 0, header: PbfHeader = { replicationTimestamp: null }
  while (offset < bytes.length) {
    const headerLength = file.readUInt32BE(offset); offset += 4
    let type = '', size = 0
    new Pbf(bytes.subarray(offset, offset + headerLength)).readFields((tag, _, p) => {
      if (tag === 1) type = p.readString()
      else if (tag === 3) size = p.readVarint()
    }, null)
    offset += headerLength
    const blob = bytes.subarray(offset, offset + size); offset += size
    if (type === 'OSMHeader') header = readHeaderBlock(readBlob(blob))
    else if (type === 'OSMData') readPrimitiveBlock(readBlob(blob), handlers)
  }
  return header
}
