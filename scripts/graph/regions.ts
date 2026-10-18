/** Launch coverage. Bounds are [west, south, east, north] in WGS84 degrees. */
export interface RegionConfig { id: string; name: string; bounds: [number, number, number, number] }

export const REGIONS: RegionConfig[] = [
  { id: 'pgh', name: 'Pittsburgh', bounds: [-80.2, 40.3, -79.75, 40.62] },
  { id: 'dc', name: 'Washington, DC', bounds: [-77.4, 38.7, -76.8, 39.15] },
]

/** Overpass requests use chunks of this size so each response stays well under the server limits. */
export const FETCH_CHUNK_DEGREES = 0.15
/** Browser tiles cover this many degrees on each side. */
export const TILE_DEGREES = 0.05
