import type { PlanningSettings } from '../domain/planner'
import { HIGHWAYS, NODE, WAY } from './format'
import type { RoutingGraph } from './graph'

const H = Object.fromEntries(HIGHWAYS.map((name, index) => [name, index])) as Record<typeof HIGHWAYS[number], number>
const BIKE_BASE: Partial<Record<number, number>> = {
  [H.service]: 1.15, [H.road]: 1.2, [H.track]: 1.4, [H.path]: 1.1, [H.footway]: 1.3, [H.pedestrian]: 1.3, [H.bridleway]: 1.5,
}
const FOOT_BASE: Partial<Record<number, number>> = {
  [H.steps]: 1.4, [H.track]: 1.1, [H.cycleway]: 1.15, [H.service]: 1.1, [H.bridleway]: 1.2, [H.busway]: 3,
}
const ROAD_CODES = new Set([H.primary, H.primary_link, H.secondary, H.secondary_link, H.tertiary, H.tertiary_link, H.unclassified, H.residential, H.living_street, H.service, H.road])

/** The multiplier on length for one way in one mode, from section 9.2 of the spec. */
export function wayMultiplier(flags: number, highway: number, settings: PlanningSettings): number {
  const bike = settings.mode === 'bike'
  let m = (bike ? BIKE_BASE[highway] : FOOT_BASE[highway]) ?? 1
  if (flags & WAY.MINOR_SERVICE) m *= bike ? 2.5 : 2
  if (bike && (flags & WAY.UNPAVED) && !(flags & WAY.PAVED)) m *= 1.2

  const primary = highway === H.primary || highway === H.primary_link
  const secondary = highway === H.secondary || highway === H.secondary_link
  const tertiary = highway === H.tertiary || highway === H.tertiary_link
  if (settings.avoidBusyRoads) {
    if (primary) m *= 4
    else if (secondary) m *= 2.5
    else if (tertiary) m *= 1.4
    if (flags & WAY.FAST) m *= 1.3
    if (flags & WAY.WIDE) m *= 1.3
  } else if (primary) m *= 1.2
  else if (secondary) m *= 1.1

  if (settings.preferInfrastructure) {
    if (bike) {
      if (flags & WAY.CYCLE_TRACK) m *= 0.7
      else if (flags & WAY.CYCLE_LANE) m *= 0.8
      else if (flags & WAY.CYCLE_SHARED) m *= 0.95
      else if ((primary || secondary) && !(flags & WAY.CYCLEWAY_TAGGED)) m *= 1.5
    } else {
      if (flags & WAY.FOOT_PATH) m *= 0.75
      else if (flags & WAY.SIDEWALK) m *= 0.8
      else if (flags & WAY.NO_SIDEWALK) m *= 1.6
    }
  }

  const trail = (flags & WAY.TRAIL) !== 0 || ((flags & WAY.UNPAVED) !== 0 && !ROAD_CODES.has(highway))
  if (settings.surface === 'paved' && (trail || (flags & WAY.UNPAVED))) m *= 2
  else if (settings.surface === 'trail') m *= trail ? 0.6 : ROAD_CODES.has(highway) ? 1.25 : 1
  return m
}

export interface Profile {
  /** Cost of each half-edge, Infinity where the mode can't travel that way. */
  cost: Float64Array
  /** The smallest cost per meter anywhere, which keeps the A* heuristic admissible. */
  minRatio: number
  blocked: (node: number) => boolean
  restricted: boolean
}

export interface GradeOptions { elevations: Float64Array | null; choice: PlanningSettings['elevation']; rate: number | null }

/** Cost per meter of climb added to (or, as a negative number, subtracted from) an edge for the elevation choice. */
function climbWeight(choice: PlanningSettings['elevation'], rate: number | null): number {
  if (choice === 'flat') return 12
  if (choice === 'hilly') return -3
  if (choice === 'steep') return -8
  if (choice === 'custom' && rate !== null) return rate < 0.0038 ? 12 : rate < 0.016 ? -3 : -8
  return 0
}

export function buildProfile(graph: RoutingGraph, settings: PlanningSettings, grade: GradeOptions, discounted?: Set<number>): Profile {
  const bike = settings.mode === 'bike'
  const forwardBit = bike ? WAY.BIKE_FORWARD : WAY.FOOT_FORWARD, backwardBit = bike ? WAY.BIKE_BACKWARD : WAY.FOOT_BACKWARD
  const wayCost = graph.wayFlags.map((flags, way) => wayMultiplier(flags, graph.wayHighway[way]!, settings))
  const cost = new Float64Array(graph.edgeCount * 2)
  const weight = grade.elevations ? climbWeight(grade.choice, grade.rate) : 0
  let minRatio = Infinity
  for (let e = 0; e < graph.edgeCount; e++) {
    const way = graph.edgeWay[e]!, flags = graph.wayFlags[way]!, length = graph.edgeLength[e]!
    let base = length * wayCost[way]!
    if (discounted?.has(graph.edgeOrigin[e]!)) base *= 0.35
    for (const direction of [0, 1]) {
      const allowed = flags & (direction ? backwardBit : forwardBit)
      let c = Infinity
      if (allowed) {
        c = base
        if (weight && grade.elevations) {
          const from = direction ? graph.edgeB[e]! : graph.edgeA[e]!, to = direction ? graph.edgeA[e]! : graph.edgeB[e]!
          const climb = Math.max(0, grade.elevations[to]! - grade.elevations[from]!)
          c = Math.max(base * 0.4, base + climb * weight)
        }
        if (length > 0) minRatio = Math.min(minRatio, c / length)
      }
      cost[e * 2 + direction] = c
    }
  }
  const blockedBit = bike ? NODE.BIKE_BLOCKED : NODE.FOOT_BLOCKED
  return {
    cost, minRatio: Number.isFinite(minRatio) ? minRatio : 1,
    blocked: node => (graph.nodeFlags[node]! & blockedBit) !== 0,
    restricted: bike,
  }
}
