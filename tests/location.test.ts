import { describe, expect, it } from 'vitest'
import { LOCATE_OPTIONS, locationErrorMessage } from '../app/domain/location'

describe('location errors', () => {
  it('says location is off only when the permission is denied', () => {
    expect(locationErrorMessage(1)).toBe('Location is off. Search for a start instead.')
  })

  it('says the location could not be found for a timeout or an unavailable fix', () => {
    expect(locationErrorMessage(2)).toBe("Couldn't find your location. Search for a start instead.")
    expect(locationErrorMessage(3)).toBe("Couldn't find your location. Search for a start instead.")
  })

  it('waits up to 20 seconds for a fix and accepts one cached within the last minute', () => {
    expect(LOCATE_OPTIONS).toEqual({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 })
  })
})
