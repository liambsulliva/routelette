import { describe, expect, it } from 'vitest'
import { censusPlace } from '../server/utils/geocode'

describe('Census matches', () => {
  it('spells out directions and street types so the labels match Photon', () => {
    const place = censusPlace({
      matchedAddress: '100 N HIGHLAND AVE, PITTSBURGH, PA, 15206',
      coordinates: { x: -79.9, y: 40.46 },
      addressComponents: { fromAddress: '100', preDirection: 'N', streetName: 'HIGHLAND', suffixType: 'AVE', suffixDirection: '', city: 'PITTSBURGH' },
    })
    expect(place.label).toBe('100 North Highland Avenue, Pittsburgh')
  })

  it('keeps the matched point as the place coordinates and id', () => {
    const place = censusPlace({
      matchedAddress: '4900 FRIENDSHIP AVE, PITTSBURGH, PA, 15224',
      coordinates: { x: -79.945561906219, y: 40.462291100185 },
      addressComponents: { fromAddress: '4900', preDirection: '', streetName: 'FRIENDSHIP', suffixType: 'AVE', suffixDirection: '', city: 'PITTSBURGH' },
    })
    expect(place.coordinates).toEqual([-79.945561906219, 40.462291100185])
    expect(place.id).toBe('census--79.945561906219,40.462291100185')
    expect(place.label).toBe('4900 Friendship Avenue, Pittsburgh')
  })
})
