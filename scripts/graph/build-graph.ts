/**
 * Builds the static routing snapshot from Geofabrik PBF extracts in .data/osm/pbf/.
 * Writes public/graph/manifest.json and public/graph/<version>/<tile>.bin.
 *
 *   npm run graph:build -- [region id ...]
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { encodeTile } from '../../app/engine/format'
import type { TileInput } from '../../app/engine/format'
import { assembleRegion, indexOf, sortedUnique } from './assemble'
import type { RawWay } from './assemble'
import { readPbf } from './pbf'
import type { PbfRelation } from './pbf'
import { deriveBarrier, deriveWay, restrictionKind } from './tags'
import { REGIONS, TILE_DEGREES } from './regions'
import type { RegionConfig } from './regions'

const SOURCES: Record<string, string[]> = {
  pgh: ['pennsylvania'],
  dc: ['district-of-columbia', 'maryland', 'virginia'],
}
const PBF_DIR = join('.data', 'osm', 'pbf')
const OUTPUT_DIR = join('public', 'graph')
const MARGIN = 0.03
const MISSING = 0x7fffffff

interface RegionResult { region: RegionConfig; tiles: Map<string, TileInput>; timestamp: number | null; stats: Record<string, number> }

function buildRegion(region: RegionConfig): RegionResult {
  const [west, south, east, north] = region.bounds
  const files = SOURCES[region.id]!.map(name => join(PBF_DIR, `${name}.osm.pbf`))
  const ways = new Map<number, RawWay>()
  const relations = new Map<number, PbfRelation>()
  let timestamp: number | null = null

  // Pass 1: routable ways and bicycle turn restrictions.
  for (const file of files) {
    console.log(`  ways from ${file}`)
    const header = readPbf(file, {
      wantNodes: false,
      way(way) {
        if (ways.has(way.id)) return
        const derived = deriveWay(way.tags)
        if (derived) ways.set(way.id, { id: way.id, refs: way.refs, ...derived })
      },
      relation(relation) { if (restrictionKind(relation.tags) !== null) relations.set(relation.id, relation) },
    })
    if (header.replicationTimestamp) timestamp = Math.min(timestamp ?? Infinity, header.replicationTimestamp)
  }

  let refCount = 0
  for (const way of ways.values()) refCount += way.refs.length
  const all = new Float64Array(refCount)
  let cursor = 0
  for (const way of ways.values()) for (const ref of way.refs) all[cursor++] = ref
  const needed = sortedUnique(all)
  const lon = new Int32Array(needed.length).fill(MISSING), lat = new Int32Array(needed.length).fill(MISSING)
  const barrier = new Uint8Array(needed.length)

  // Pass 2: coordinates for way nodes near the region, plus barrier rules.
  for (const file of files) {
    console.log(`  nodes from ${file}`)
    readPbf(file, {
      wantNodeTags: true,
      node(node) {
        if (node.lon < west - MARGIN || node.lon > east + MARGIN || node.lat < south - MARGIN || node.lat > north + MARGIN) return
        const index = indexOf(needed, node.id)
        if (index < 0) return
        lon[index] = Math.round(node.lon * 1e7); lat[index] = Math.round(node.lat * 1e7)
        if (node.tags) barrier[index] = deriveBarrier(node.tags)
      },
    })
  }

  return { region, timestamp, ...assembleRegion(region, { ways: [...ways.values()], needed, lon, lat, barrier, relations: [...relations.values()] }) }
}

async function main() {
  const wanted = process.argv.slice(2)
  const results: RegionResult[] = []
  for (const region of REGIONS.filter(r => !wanted.length || wanted.includes(r.id))) {
    console.log(`${region.name}`)
    const started = Date.now()
    results.push(buildRegion(region))
    console.log(`  ${JSON.stringify(results.at(-1)!.stats)} in ${((Date.now() - started) / 1000).toFixed(0)}s`)
  }
  const timestamp = Math.min(...results.map(r => r.timestamp ?? Date.now() / 1000))
  const date = new Date(timestamp * 1000)
  const version = `osm-${date.toISOString().slice(0, 10).replaceAll('-', '')}`
  await rm(OUTPUT_DIR, { recursive: true, force: true })
  await mkdir(join(OUTPUT_DIR, version), { recursive: true })
  let bytes = 0
  for (const result of results) for (const [key, tile] of result.tiles) {
    const data = encodeTile(tile)
    bytes += data.byteLength
    await writeFile(join(OUTPUT_DIR, version, `${key}.bin`), data)
  }
  const manifest = {
    schemaVersion: 1, version, builtAt: new Date().toISOString(), tileDegrees: TILE_DEGREES,
    attribution: '© OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright',
    regions: results.map(r => ({
      id: r.region.id, name: r.region.name, bounds: r.region.bounds, dataTimestamp: new Date((r.timestamp ?? timestamp) * 1000).toISOString(),
      tiles: [...r.tiles.keys()].sort(),
    })),
  }
  await writeFile(join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`Wrote ${results.reduce((sum, r) => sum + r.tiles.size, 0)} tiles, ${(bytes / 1e6).toFixed(1)} MB, version ${version}`)
}

await main()
