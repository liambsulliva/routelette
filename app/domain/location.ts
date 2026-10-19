/** Geolocation options. A fix up to a minute old is fine, and a slow fix gets 20 seconds. */
export const LOCATE_OPTIONS = { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 } as const

/** GeolocationPositionError.PERMISSION_DENIED. */
const PERMISSION_DENIED = 1

/** Only a denied permission means location is off. A timeout or unavailable fix is a different failure. */
export function locationErrorMessage(code: number): string {
  return code === PERMISSION_DENIED ? 'Location is off. Search for a start instead.' : "Couldn't find your location. Search for a start instead."
}
