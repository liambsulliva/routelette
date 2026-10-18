/** Turns OSM tags into the compact way and barrier attributes stored in graph tiles. */
import { HIGHWAYS, NODE, WAY } from '../../app/engine/format'
import type { Tags } from './pbf'

const DENIED = new Set(['no', 'private', 'agricultural', 'forestry', 'delivery', 'military', 'emergency'])
const ALLOWED = new Set(['yes', 'designated', 'permissive', 'official', 'destination', 'customers'])
const PAVED = new Set(['asphalt', 'concrete', 'paved', 'paving_stones', 'concrete:plates', 'concrete:lanes', 'chipseal', 'sett', 'metal', 'wood', 'bricks', 'brick'])
const UNPAVED = new Set(['unpaved', 'gravel', 'fine_gravel', 'dirt', 'ground', 'grass', 'earth', 'compacted', 'mud', 'sand', 'pebblestone', 'woodchips', 'rock', 'stone', 'grass_paver'])
const ROADS = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road'])
const MINOR_SERVICE = new Set(['driveway', 'parking_aisle', 'drive-through', 'parking'])
const HARD_BARRIERS = new Set(['fence', 'wall', 'wire_fence', 'hedge', 'retaining_wall', 'city_wall', 'ditch', 'guard_rail', 'jersey_barrier'])
const NO_BIKE_BARRIERS = new Set(['stile', 'turnstile', 'full-height_turnstile', 'kissing_gate', 'step', 'steps'])
const CYCLEWAY_KEYS = ['cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both']
const SIDEWALK_SIDES = ['sidewalk:left', 'sidewalk:right', 'sidewalk:both']

export const HIGHWAY_CODE = new Map<string, number>(HIGHWAYS.map((name, index) => [name, index]))

function access(tags: Tags, specific: string, fallback: boolean): boolean {
  const value = tags[specific]
  if (value && ALLOWED.has(value)) return true
  if (value && (DENIED.has(value) || value === 'use_sidepath' || value === 'dismount')) return false
  if (specific === 'bicycle' && tags.vehicle && DENIED.has(tags.vehicle)) return false
  if (tags.access && DENIED.has(tags.access)) return false
  return fallback
}

function direction(value: string | undefined): 'both' | 'forward' | 'backward' {
  if (value === 'yes' || value === 'true' || value === '1') return 'forward'
  if (value === '-1' || value === 'reverse') return 'backward'
  return 'both'
}

function speedMph(value: string | undefined): number | null {
  if (!value) return null
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) return null
  return value.includes('mph') ? number : number / 1.609344
}

export interface DerivedWay { highway: number; flags: number; name: string }

export function deriveWay(tags: Tags): DerivedWay | null {
  const raw = tags.highway
  if (!raw || tags.area === 'yes') return null
  const highway = HIGHWAY_CODE.get(raw)
  if (highway === undefined || raw === 'other') return null
  if (tags.service === 'emergency_access') return null

  const foot = access(tags, 'foot', raw !== 'busway')
  const bikeDefault = ROADS.has(raw) || raw === 'cycleway' || raw === 'track'
  const bike = raw !== 'steps' && access(tags, 'bicycle', bikeDefault)
  if (!foot && !bike) return null

  let flags = 0
  const footDirection = direction(tags['oneway:foot'])
  if (foot) flags |= footDirection === 'backward' ? WAY.FOOT_BACKWARD : footDirection === 'forward' ? WAY.FOOT_FORWARD : WAY.FOOT_FORWARD | WAY.FOOT_BACKWARD

  if (bike) {
    const contraflow = CYCLEWAY_KEYS.some(key => tags[key]?.startsWith('opposite'))
      || ['cycleway:left:oneway', 'cycleway:right:oneway', 'cycleway:both:oneway'].some(key => tags[key] === 'no' || tags[key] === '-1')
    let oneway = tags['oneway:bicycle'] ?? (contraflow ? 'no' : tags.oneway)
    if (oneway === undefined && (tags.junction === 'roundabout' || tags.junction === 'circular')) oneway = 'yes'
    const bikeDirection = direction(oneway)
    flags |= bikeDirection === 'backward' ? WAY.BIKE_BACKWARD : bikeDirection === 'forward' ? WAY.BIKE_FORWARD : WAY.BIKE_FORWARD | WAY.BIKE_BACKWARD
  }

  const sidewalk = tags.sidewalk
  if ((sidewalk && ['both', 'left', 'right', 'separate', 'yes'].includes(sidewalk)) || SIDEWALK_SIDES.some(key => tags[key] === 'yes' || tags[key] === 'separate')) flags |= WAY.SIDEWALK
  if ((sidewalk === 'no' || sidewalk === 'none') && raw !== 'residential' && raw !== 'living_street') flags |= WAY.NO_SIDEWALK
  if (raw === 'footway' || raw === 'pedestrian' || raw === 'living_street' || (raw === 'path' && foot)) flags |= WAY.FOOT_PATH
  if (tags.footway === 'sidewalk') flags |= WAY.SIDEWALK_WAY

  const cycleways = CYCLEWAY_KEYS.map(key => tags[key]).filter((value): value is string => !!value)
  if (raw === 'cycleway' || cycleways.includes('track') || tags.bicycle_road === 'yes') flags |= WAY.CYCLE_TRACK
  if (cycleways.includes('lane') || tags.bicycle === 'designated') flags |= WAY.CYCLE_LANE
  if (cycleways.includes('shared_lane')) flags |= WAY.CYCLE_SHARED
  if (cycleways.some(value => value !== 'no' && value !== 'none')) flags |= WAY.CYCLEWAY_TAGGED

  const surface = tags.surface
  const offRoad = raw === 'path' || raw === 'track' || raw === 'bridleway'
  if (surface && PAVED.has(surface)) flags |= WAY.PAVED
  else if (surface && UNPAVED.has(surface)) flags |= WAY.UNPAVED
  if ((offRoad || raw === 'footway') && (flags & WAY.UNPAVED)) flags |= WAY.TRAIL
  if (offRoad && !surface) flags |= WAY.TRAIL

  const speed = speedMph(tags.maxspeed)
  if (speed !== null && speed > 35) flags |= WAY.FAST
  const lanes = Number.parseInt(tags.lanes ?? '', 10)
  if (Number.isFinite(lanes) && lanes >= 4) flags |= WAY.WIDE
  if (tags.lit === 'yes') flags |= WAY.LIT
  if (raw === 'service' && tags.service && MINOR_SERVICE.has(tags.service)) flags |= WAY.MINOR_SERVICE

  return { highway, flags, name: tags.name ?? tags.ref ?? '' }
}

/** Barrier flags for a tagged node, or 0 when it can be passed in every mode. */
export function deriveBarrier(tags: Tags): number {
  const barrier = tags.barrier
  if (!barrier) return 0
  let flags = 0
  const hard = HARD_BARRIERS.has(barrier)
  const footAllowed = tags.foot && ALLOWED.has(tags.foot)
  const bikeAllowed = tags.bicycle && ALLOWED.has(tags.bicycle)
  const closed = tags.access ? DENIED.has(tags.access) : false
  if ((hard && !footAllowed) || tags.foot === 'no' || (closed && !footAllowed)) flags |= NODE.FOOT_BLOCKED
  if ((hard && !bikeAllowed) || (NO_BIKE_BARRIERS.has(barrier) && !bikeAllowed) || tags.bicycle === 'no' || (closed && !bikeAllowed)) flags |= NODE.BIKE_BLOCKED
  return flags
}

/** The bicycle restriction kind for a restriction relation, or null when it doesn't apply to bicycles. */
export function restrictionKind(tags: Tags): 0 | 1 | null {
  if (tags.type !== 'restriction') return null
  const value = tags['restriction:bicycle'] ?? (tags.except?.split(';').map(part => part.trim()).includes('bicycle') ? undefined : tags.restriction)
  if (!value) return null
  if (value.startsWith('no_')) return 0
  if (value.startsWith('only_')) return 1
  return null
}
