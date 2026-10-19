import { REGIONS } from '../../scripts/graph/regions'

interface PhotonFeature {
  properties?: { osm_id?: number; name?: string; street?: string; housenumber?: string; city?: string; state?: string }
  geometry?: { coordinates?: number[] }
}
interface CensusMatch {
  matchedAddress: string
  coordinates: { x: number; y: number }
  addressComponents: { fromAddress: string; preDirection: string; streetName: string; suffixType: string; suffixDirection: string; city: string }
}
interface Candidate { place: { id: string; label: string; coordinates: [number, number] }; score: number; exact: boolean; local: boolean }

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
// Census answers a numbered address only with a city or state, so typed addresses without one try each launch region.
const CENSUS_REGIONS = ['Pittsburgh, PA', 'Washington, DC']
// Census writes street parts in capitals and abbreviations. Photon spells them out, so the labels match.
const CENSUS_WORDS: Record<string, string> = {
  N: 'North', S: 'South', E: 'East', W: 'West', NE: 'Northeast', NW: 'Northwest', SE: 'Southeast', SW: 'Southwest',
  AVE: 'Avenue', ST: 'Street', BLVD: 'Boulevard', RD: 'Road', DR: 'Drive', LN: 'Lane', CT: 'Court', PL: 'Place', PKWY: 'Parkway', TER: 'Terrace', HWY: 'Highway', WAY: 'Way', CIR: 'Circle', SQ: 'Square',
}
// Expands the short forms people type, so "Ave NW" and "Avenue Northwest" compare equal.
const EXPANSIONS: Record<string, string> = {
  ave: 'avenue', av: 'avenue', st: 'street', blvd: 'boulevard', rd: 'road', dr: 'drive', ln: 'lane', ct: 'court', pl: 'place', pkwy: 'parkway', ter: 'terrace', hwy: 'highway',
  n: 'north', s: 'south', e: 'east', w: 'west', nw: 'northwest', ne: 'northeast', sw: 'southwest', se: 'southeast',
}

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map(word => EXPANSIONS[word] ?? word)
}
/** "4900 Friendship Ave, Pittsburgh" gives house number 4900 and the words of the street. */
function parseAddress(q: string) {
  const match = /^(\d+[a-z]?)\s+(.+)$/i.exec(q.split(',')[0] ?? '')
  return match ? { number: match[1]!.toLowerCase(), words: words(match[2]!) } : null
}
/** Title case for Census output, which arrives in capitals. */
function title(text: string): string {
  return text.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase())
}
function inLaunchRegion(lon: number, lat: number): boolean {
  return REGIONS.some(({ bounds: [west, south, east, north] }) => lon >= west && lon <= east && lat >= south && lat <= north)
}
function fromPhoton(feature: PhotonFeature, typed: string[], number: string | null): Candidate | null {
  const point = feature.geometry?.coordinates, p = feature.properties
  if (!point || point.length < 2 || !p) return null
  const address = [p.housenumber, p.street].filter(Boolean).join(' ')
  const name = address || p.name || 'Map location'
  const area = p.city || p.state
  const overlap = words(p.street ?? '').filter(word => typed.includes(word)).length
  const exact = !!number && p.housenumber?.toLowerCase() === number
  const local = inLaunchRegion(point[0]!, point[1]!)
  return {
    place: { id: String(p.osm_id ?? point.join(',')), label: area ? `${name}, ${area}` : name, coordinates: [point[0]!, point[1]!] },
    score: (exact ? 10 : 0) + (local ? 5 : 0) + overlap, exact, local,
  }
}
async function fromCensus(address: string): Promise<Candidate[]> {
  const response = await $fetch<{ result?: { addressMatches?: CensusMatch[] } }>(CENSUS_URL, {
    query: { address, benchmark: 'Public_AR_Current', format: 'json' }, timeout: 5000,
  })
  return (response.result?.addressMatches ?? []).slice(0, 2).map(match => {
    const a = match.addressComponents
    const street = [a.preDirection, a.streetName, a.suffixType, a.suffixDirection].filter(Boolean)
      .map(part => CENSUS_WORDS[part] ?? title(part)).join(' ')
    const x = match.coordinates.x, y = match.coordinates.y
    // fromAddress is where the block's range starts. The matched address carries the number the user typed.
    const house = match.matchedAddress.split(' ')[0]!
    return { place: { id: `census-${x},${y}`, label: `${house} ${street}, ${title(a.city)}`, coordinates: [x, y] }, score: 15, exact: true, local: true }
  })
}
async function censusCandidates(q: string): Promise<Candidate[]> {
  const addresses = q.includes(',') ? [q] : CENSUS_REGIONS.map(region => `${q}, ${region}`)
  const settled = await Promise.allSettled(addresses.map(fromCensus))
  return settled.flatMap(result => result.status === 'fulfilled' ? result.value : [])
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 150) : ''
  const lon = Number(query.lon), lat = Number(query.lat)
  const reverse = query.reverse === '1' && Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90
  if (!reverse && q.length < 2) return []
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=3600')
  const config = useRuntimeConfig(event)
  const address = reverse ? null : parseAddress(q)
  const typed = reverse ? [] : words(q.split(',')[0] ?? '')
  const number = address?.number ?? null
  try {
    const response = await $fetch<{ features: PhotonFeature[] }>(`${config.photonUrl}/${reverse ? 'reverse' : 'api'}/`, {
      query: reverse ? { lon, lat } : { q, limit: 10, lon: -79.94, lat: 40.46 },
      timeout: 7000,
    })
    const candidates = response.features.flatMap(feature => {
      const candidate = fromPhoton(feature, typed, number)
      return candidate ? [candidate] : []
    }).sort((a, b) => b.score - a.score)
    // Photon's house numbers are patchy. When it has no exact house match inside the launch regions, Census supplies one.
    if (address && !candidates.some(candidate => candidate.exact && candidate.local)) {
      try { candidates.unshift(...await censusCandidates(q)) } catch { /* Photon's street matches still answer the search. */ }
    }
    const seen = new Set<string>()
    return candidates.flatMap(candidate => {
      const key = candidate.place.label.toLowerCase()
      if (seen.has(key)) return []
      seen.add(key)
      return [candidate.place]
    }).slice(0, 5)
  } catch {
    throw createError({ statusCode: 503, statusMessage: "Search isn't responding. Try again." })
  }
})
