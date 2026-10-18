import { describe, expect, it } from 'vitest'
import { commitDistance, distanceLimits, elevationCaption, gainText, METERS_PER_MILE, toDistance } from '../app/domain/units'
import { previewRoutes } from '../app/services/fixture-planner'
import { decodeRoute, encodeRoute } from '../app/services/share'

describe('distance entry', () => {
  it('accepts typed distances beyond the slider and clamps them at the activity cap', () => {
    expect(commitDistance('40', 'run', 'mi', 1)).toBe(40 * METERS_PER_MILE)
    expect(commitDistance('500', 'run', 'mi', 1)).toBe(50 * METERS_PER_MILE)
    expect(commitDistance('0', 'walk', 'mi', 1)).toBe(0.5 * METERS_PER_MILE)
  })
  it('preserves the prior distance for empty or invalid input', () => {
    for (const value of ['', ' ', 'NaN', 'Infinity', 'five']) expect(commitDistance(value, 'run', 'mi', 8000)).toBe(8000)
  })
  it('changes display units without changing the physical distance', () => {
    expect(toDistance(METERS_PER_MILE, 'km')).toBeCloseTo(1.609344)
    expect(distanceLimits('run', 'km').maximum).toBeCloseTo(26 * 1.609344)
    expect(commitDistance('10', 'run', 'km', 1)).toBe(10000)
  })
  it('keeps missing elevation distinct from a flat route', () => {
    expect(gainText(null, 'mi')).toBe('Unavailable')
    expect(gainText(0, 'mi')).toBe('0')
  })
  it('keeps the Any elevation caption so the picker row does not change height', () => {
    expect(elevationCaption('any', 5 * METERS_PER_MILE, 'mi')).toBe('Any: Elevation is not scored')
  })
})

describe('shared route links', () => {
  it('round-trips recorded route geometry and Unicode route names', () => {
    const route = { ...previewRoutes()[0]!, name: 'Café loop' }
    const decoded = decodeRoute(encodeRoute(route))
    expect(decoded?.coordinates).toEqual(route.coordinates)
    expect(decoded?.name).toBe(route.name)
    expect(decoded?.distanceMeters).toBe(route.distanceMeters)
    expect(decoded?.provenance.kind).toBe('fixture')
  })
  it('rejects malformed, oversized and out-of-bounds geometry', () => {
    expect(decodeRoute('not-json')).toBeNull()
    expect(decodeRoute('a'.repeat(32001))).toBeNull()
    const route = previewRoutes()[0]!
    route.coordinates[0] = [181, 40]
    expect(decodeRoute(encodeRoute(route))).toBeNull()
  })
})
