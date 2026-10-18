/**
 * Cuts a small Bloomfield extract from the Pennsylvania PBF for the engine tests.
 *
 *   node node_modules/jiti/lib/jiti-cli.mjs scripts/graph/extract-fixture.ts
 */
import { writeFileSync } from 'node:fs'
import { readPbf } from './pbf'
import type { PbfRelation } from './pbf'
const [west, south, east, north] = [-79.956, 40.455, -79.936, 40.468]
const KEEP = new Set(['highway', 'surface', 'access', 'foot', 'bicycle', 'vehicle', 'sidewalk', 'sidewalk:left', 'sidewalk:right', 'sidewalk:both', 'footway', 'cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both', 'bicycle_road', 'lit', 'maxspeed', 'lanes', 'name', 'oneway', 'oneway:bicycle', 'oneway:foot', 'junction', 'service', 'area', 'barrier', 'type', 'restriction', 'restriction:bicycle', 'except'])
const pick = (tags: Record<string, string>) => Object.fromEntries(Object.entries(tags).filter(([key]) => KEEP.has(key)))
const file = '.data/osm/pbf/pennsylvania.osm.pbf'
const inside = new Map<number, { id: number; lon: number; lat: number; tags?: Record<string, string> }>()
readPbf(file, { wantNodeTags: true, node(node) {
  if (node.lon < west || node.lon > east || node.lat < south || node.lat > north) return
  inside.set(node.id, { id: node.id, lon: Math.round(node.lon * 1e7) / 1e7, lat: Math.round(node.lat * 1e7) / 1e7, ...(node.tags?.barrier ? { tags: pick(node.tags) } : {}) })
} })
const ways: Array<{ id: number; refs: number[]; tags: Record<string, string> }> = []
const relations: PbfRelation[] = []
readPbf(file, { wantNodes: false,
  way(way) {
    if (!way.tags.highway) return
    if (way.refs.filter(ref => inside.has(ref)).length < 2) return
    // Refs outside the box have no coordinates in the extract, so the builder splits the way there.
    ways.push({ id: way.id, refs: way.refs, tags: pick(way.tags) })
  },
  relation(relation) { if (relation.tags.type === 'restriction') relations.push({ id: relation.id, members: relation.members, tags: pick(relation.tags) }) },
})
const wayIds = new Set(ways.map(way => way.id))
const used = new Set(ways.flatMap(way => way.refs))
const kept = relations.filter(r => r.members.every(m => m.type === 'node' ? used.has(m.ref) : m.type === 'way' ? wayIds.has(m.ref) : false))
const nodes = [...inside.values()].filter(node => used.has(node.id))
const out = { source: 'OpenStreetMap contributors, ODbL 1.0, Geofabrik pennsylvania-latest 2026-10-18', bounds: [west, south, east, north], nodes, ways, relations: kept }
writeFileSync('tests/fixtures/bloomfield.osm.json', JSON.stringify(out))
console.log(nodes.length, 'nodes', ways.length, 'ways', kept.length, 'restrictions')
