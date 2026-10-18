import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { initialSettings, PlanningFailure } from '../app/domain/planner'
import type { Coordinates, GraphManifest, PlanningRequest, PlanningSettings } from '../app/domain/planner'
import { gainFrom } from '../app/engine/elevation'
import type { ElevationSource } from '../app/engine/elevation'
import { plan } from '../app/engine/engine'
import { decodeTile, encodeTile, HIGHWAYS, NODE, WAY } from '../app/engine/format'
import type { DecodedTile } from '../app/engine/format'
import { haversine } from '../app/engine/geo'
import { RoutingGraph } from '../app/engine/graph'
import { pathLength, removeSpurs } from '../app/engine/loops'
import { buildProfile, wayMultiplier } from '../app/engine/profile'
import { PathFinder } from '../app/engine/search'
import { assembleRegion, sourceFromElements } from '../scripts/graph/assemble'
import type { PbfRelation } from '../scripts/graph/pbf'
import { deriveBarrier, deriveWay, restrictionKind } from '../scripts/graph/tags'

const MILE = 1609.344
const H = (name: typeof HIGHWAYS[number]) => HIGHWAYS.indexOf(name)
type Elements = Parameters<typeof sourceFromElements>[0]

function tilesFor(elements: Elements, bounds: [number, number, number, number]) {
  const region = { id: 'test', name: 'Test', bounds }
  const { tiles } = assembleRegion(region, sourceFromElements(elements))
  const decoded = new Map<string, DecodedTile>()
  for (const [id, tile] of tiles) decoded.set(id, decodeTile(encodeTile(tile).buffer as ArrayBuffer))
  const manifest: GraphManifest = { schemaVersion: 1, version: 'test', builtAt: '2026-10-18', tileDegrees: 0.05, attribution: 'OSM', regions: [{ ...region, tiles: [...decoded.keys()] }] }
  return { manifest, decoded }
}

const bloomfield = JSON.parse(readFileSync('tests/fixtures/bloomfield.osm.json', 'utf8')) as Elements & { bounds: [number, number, number, number] }
const fixture = tilesFor(bloomfield, bloomfield.bounds)
const START: Coordinates = [-79.945506, 40.462302]
const noElevation: ElevationSource = { load: async () => false, at: () => null }

function context(source = fixture, elevation = noElevation) {
  return {
    manifest: source.manifest, elevation, signal: new AbortController().signal, pause: async () => {},
    tile: async (id: string) => source.decoded.get(id)!,
  }
}
function settings(patch: Partial<PlanningSettings> = {}): PlanningSettings {
  return { ...initialSettings(), start: { id: 'start', label: '4900 Friendship Ave', coordinates: START }, distanceMeters: 2 * MILE, seed: 42, ...patch }
}
function request(patch: Partial<PlanningSettings> = {}, operation: PlanningRequest['operation'] = 'generate'): PlanningRequest {
  return { id: 1, operation, settings: settings(patch) }
}

describe('tag derivation', () => {
  it('applies one-way rules to bikes but not to people on foot', () => {
    const way = deriveWay({ highway: 'residential', oneway: 'yes' })!
    expect(way.flags & WAY.BIKE_FORWARD).toBeTruthy()
    expect(way.flags & WAY.BIKE_BACKWARD).toBe(0)
    expect(way.flags & (WAY.FOOT_FORWARD | WAY.FOOT_BACKWARD)).toBe(WAY.FOOT_FORWARD | WAY.FOOT_BACKWARD)
    expect(deriveWay({ highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no' })!.flags & WAY.BIKE_BACKWARD).toBeTruthy()
    expect(deriveWay({ highway: 'residential', oneway: 'yes', cycleway: 'opposite_lane' })!.flags & WAY.BIKE_BACKWARD).toBeTruthy()
    expect(deriveWay({ highway: 'tertiary', junction: 'roundabout' })!.flags & WAY.BIKE_BACKWARD).toBe(0)
  })

  it('follows the access hierarchy for each mode', () => {
    expect(deriveWay({ highway: 'footway' })!.flags & (WAY.BIKE_FORWARD | WAY.BIKE_BACKWARD)).toBe(0)
    expect(deriveWay({ highway: 'footway', bicycle: 'yes' })!.flags & WAY.BIKE_FORWARD).toBeTruthy()
    expect(deriveWay({ highway: 'steps', bicycle: 'yes' })!.flags & WAY.BIKE_FORWARD).toBe(0)
    expect(deriveWay({ highway: 'service', access: 'private' })).toBeNull()
    expect(deriveWay({ highway: 'service', access: 'private', foot: 'yes' })!.flags & WAY.FOOT_FORWARD).toBeTruthy()
    expect(deriveWay({ highway: 'primary', bicycle: 'use_sidepath' })!.flags & WAY.BIKE_FORWARD).toBe(0)
    expect(deriveWay({ highway: 'residential', vehicle: 'no' })!.flags & WAY.BIKE_FORWARD).toBe(0)
    expect(deriveWay({ highway: 'pedestrian', area: 'yes' })).toBeNull()
  })

  it('blocks barriers per mode and keeps only bicycle restrictions', () => {
    expect(deriveBarrier({ barrier: 'bollard' })).toBe(0)
    expect(deriveBarrier({ barrier: 'stile' })).toBe(NODE.BIKE_BLOCKED)
    expect(deriveBarrier({ barrier: 'gate', access: 'private' })).toBe(NODE.FOOT_BLOCKED | NODE.BIKE_BLOCKED)
    expect(restrictionKind({ type: 'restriction', restriction: 'no_left_turn' })).toBe(0)
    expect(restrictionKind({ type: 'restriction', restriction: 'only_straight_on' })).toBe(1)
    expect(restrictionKind({ type: 'restriction', restriction: 'no_left_turn', except: 'bicycle' })).toBeNull()
    expect(restrictionKind({ type: 'restriction', restriction: 'no_left_turn', 'restriction:bicycle': 'only_right_turn' })).toBe(1)
  })
})

describe('cost multipliers', () => {
  const run = settings(), bike = settings({ mode: 'bike' })
  it('weights busy roads only while the switch is on', () => {
    expect(wayMultiplier(0, H('primary'), run)).toBeCloseTo(4)
    expect(wayMultiplier(0, H('primary'), { ...run, avoidBusyRoads: false })).toBeCloseTo(1.2)
    expect(wayMultiplier(WAY.FAST | WAY.WIDE, H('secondary'), run)).toBeCloseTo(2.5 * 1.3 * 1.3)
  })
  it('prefers sidewalks for runs and bike lanes for rides', () => {
    expect(wayMultiplier(WAY.SIDEWALK, H('residential'), run)).toBeCloseTo(0.8)
    expect(wayMultiplier(WAY.FOOT_PATH, H('footway'), run)).toBeCloseTo(0.75)
    expect(wayMultiplier(WAY.SIDEWALK, H('residential'), { ...run, preferInfrastructure: false })).toBeCloseTo(1)
    expect(wayMultiplier(WAY.CYCLE_TRACK, H('cycleway'), bike)).toBeCloseTo(0.7)
    expect(wayMultiplier(0, H('secondary'), { ...bike, avoidBusyRoads: false })).toBeCloseTo(1.1 * 1.5)
  })
  it('applies the surface preference last', () => {
    expect(wayMultiplier(WAY.TRAIL, H('path'), { ...run, surface: 'trail' })).toBeCloseTo(0.6)
    expect(wayMultiplier(WAY.TRAIL, H('path'), { ...run, surface: 'paved' })).toBeCloseTo(2)
  })
})

describe('turn restrictions', () => {
  // A crossroads at (0, 0) where turning from A St onto B St is banned, with a side street around the corner.
  const p = (x: number, y: number) => ({ lon: -80 + x * 0.001, lat: 40 + y * 0.001 })
  const elements: Elements = {
    nodes: [{ id: 1, ...p(0, 0) }, { id: 2, ...p(0, 1) }, { id: 3, ...p(1, 0) }, { id: 4, ...p(0, -1) }, { id: 5, ...p(-1, 0) }, { id: 6, ...p(-1, 2) }],
    ways: [
      { id: 10, refs: [5, 1, 3], tags: { highway: 'residential', name: 'A St' } },
      { id: 11, refs: [2, 1, 4], tags: { highway: 'residential', name: 'B St' } },
      { id: 12, refs: [5, 6, 2], tags: { highway: 'residential', name: 'Side St' } },
    ],
    relations: [{ id: 99, tags: { type: 'restriction', restriction: 'no_left_turn' }, members: [
      { type: 'way', ref: 10, role: 'from' }, { type: 'node', ref: 1, role: 'via' }, { type: 'way', ref: 11, role: 'to' },
    ] } satisfies PbfRelation],
  }
  const tiles = tilesFor(elements, [-80.01, 39.99, -79.99, 40.01])
  const graph = RoutingGraph.fromTiles([...tiles.decoded.values()])
  const at = (x: number, y: number) => graph.nodesNear([-80 + x * 0.001, 40 + y * 0.001], 1)[0]!
  const route = (mode: PlanningSettings['mode']) => {
    const profile = buildProfile(graph, settings({ mode }), { elevations: null, choice: 'any', rate: null })
    return new PathFinder(graph, profile).find(at(-1, 0), at(0, 1))!
  }
  it('sends bikes around a banned turn and lets runners turn', () => {
    const bikeWays = route('bike').map(h => graph.wayOsm[graph.edgeWay[h >> 1]!])
    expect(bikeWays).toEqual([12])
    const runWays = route('run').map(h => graph.wayOsm[graph.edgeWay[h >> 1]!])
    expect(runWays).toEqual([10, 11])
  })
})

describe('loops', () => {
  it('finds up to three distinct loops near the target and repeats them for the same seed', async () => {
    const first = await plan(request(), context())
    expect(first.routes.length).toBeGreaterThanOrEqual(1)
    expect(first.routes.length).toBeLessThanOrEqual(3)
    for (const route of first.routes) {
      expect(Math.abs(route.distanceMeters - 2 * MILE) / (2 * MILE)).toBeLessThanOrEqual(0.1)
      expect(haversine(route.coordinates[0]!, START)).toBeLessThan(30)
      expect(haversine(route.coordinates.at(-1)!, START)).toBeLessThan(30)
      expect(route.provenance).toEqual({ kind: 'snapshot', version: 'test', region: 'Test' })
      expect(route.turns.length).toBeGreaterThan(2)
    }
    const again = await plan(request(), context())
    expect(again.routes.map(r => r.coordinates)).toEqual(first.routes.map(r => r.coordinates))
    const rolled = await plan(request({ seed: 7 }), context())
    expect(rolled.routes.map(r => r.coordinates)).not.toEqual(first.routes.map(r => r.coordinates))
  })

  it('passes through stops and explains when they need more distance', async () => {
    const stop = { id: 'stop', label: 'Rosetta St', coordinates: [-79.94385, 40.46596] as Coordinates }
    const result = await plan(request({ stops: [stop] }), context())
    expect(result.routes[0]!.coordinates.some(point => haversine(point, stop.coordinates) < 40)).toBe(true)
    const loop = (await plan(request(), context())).routes[0]!.coordinates
    const farthest = loop.reduce((best, point) => haversine(point, START) > haversine(best, START) ? point : best)
    const far = { id: 'far', label: 'Far', coordinates: farthest }
    const tight = await plan(request({ stops: [far], distanceMeters: 0.5 * MILE }), context())
    expect(tight.routes).toHaveLength(1)
    expect(tight.notices?.[0]?.code).toBe('stops-over-budget')
  })

  it('reverses a walking loop along the same streets without a legality adjustment', async () => {
    const generated = await plan(request({ mode: 'walk' }), context())
    const route = generated.routes[0]!
    const reversed = await plan({ id: 2, operation: 'reverse', settings: route.settings, route }, context())
    expect(reversed.adjustedForLegality).toBe(false)
    expect(Math.abs(reversed.routes[0]!.distanceMeters - route.distanceMeters) / route.distanceMeters).toBeLessThan(0.03)
  })

  it('reshapes only through a dragged joint', async () => {
    const generated = await plan(request(), context())
    const route = generated.routes[0]!
    const joint = route.coordinates[Math.floor(route.coordinates.length / 2)]!
    const reshaped = await plan({ id: 3, operation: 'reshape', settings: { ...route.settings, joints: [joint] }, route }, context())
    expect(reshaped.routes).toHaveLength(1)
    expect(reshaped.routes[0]!.coordinates.some(point => haversine(point, joint) < 30)).toBe(true)
  })

  it('refuses starts outside the published coverage', async () => {
    await expect(plan(request({ start: { id: 'x', label: 'Elsewhere', coordinates: [-75.16, 39.95] } }), context())).rejects.toBeInstanceOf(PlanningFailure)
  })

  it('needs elevation data for a constrained elevation choice', async () => {
    await expect(plan(request({ elevation: 'hilly' }), context())).rejects.toMatchObject({ code: 'elevation-unavailable' })
    const flat: ElevationSource = { load: async () => true, at: () => 300 }
    const result = await plan(request({ elevation: 'flat' }), context(fixture, flat))
    expect(result.routes[0]!.gainMeters).toBe(0)
  })

  it('cuts out-and-back spurs but keeps the ones that reach a stop', () => {
    const p = (x: number, y: number) => ({ lon: -80 + x * 0.001, lat: 40 + y * 0.001 })
    const elements: Elements = {
      nodes: [{ id: 1, ...p(0, 0) }, { id: 2, ...p(1, 0) }, { id: 3, ...p(1, 1) }, { id: 4, ...p(0, 1) }, { id: 5, ...p(2, 0) }],
      ways: [
        { id: 20, refs: [1, 2], tags: { highway: 'residential' } }, { id: 22, refs: [2, 3], tags: { highway: 'residential' } },
        { id: 23, refs: [3, 4], tags: { highway: 'residential' } }, { id: 24, refs: [4, 1], tags: { highway: 'residential' } },
        { id: 21, refs: [2, 5], tags: { highway: 'residential' } },
      ],
      relations: [],
    }
    const graph = RoutingGraph.fromTiles([...tilesFor(elements, [-80.01, 39.99, -79.99, 40.01]).decoded.values()])
    const node = (x: number, y: number) => graph.nodesNear([-80 + x * 0.001, 40 + y * 0.001], 1)[0]!
    const profile = buildProfile(graph, settings(), { elevations: null, choice: 'any', rate: null })
    const finder = new PathFinder(graph, profile)
    const legs = [[node(0, 0), node(1, 0)], [node(1, 0), node(2, 0)], [node(2, 0), node(1, 0)], [node(1, 0), node(1, 1)], [node(1, 1), node(0, 1)], [node(0, 1), node(0, 0)]]
    const path = legs.flatMap(([a, b]) => finder.find(a!, b!)!)
    const trimmed = removeSpurs(graph, path, new Set([node(0, 0)]))
    expect(pathLength(graph, trimmed)).toBeLessThan(pathLength(graph, path) - 100)
    const kept = removeSpurs(graph, path, new Set([node(0, 0), node(2, 0)]))
    expect(kept).toEqual(path)
  })
})

describe('elevation gain', () => {
  it('smooths noise but counts real climbing', () => {
    const noisy = Array.from({ length: 50 }, (_, i) => 100 + (i % 2 ? 1 : -1))
    expect(gainFrom(noisy)).toBeLessThan(5)
    const climb = Array.from({ length: 50 }, (_, i) => 100 + i)
    expect(gainFrom(climb)).toBeGreaterThan(44)
    expect(gainFrom(climb)).toBeLessThanOrEqual(49)
  })
})

