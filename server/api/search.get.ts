interface PhotonFeature {
  properties?: { osm_id?: number; name?: string; street?: string; housenumber?: string; city?: string; state?: string }
  geometry?: { coordinates?: number[] }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 150) : ''
  const lon = Number(query.lon), lat = Number(query.lat)
  const reverse = query.reverse === '1' && Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90
  if (!reverse && q.length < 2) return []
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=3600')
  const config = useRuntimeConfig(event)
  try {
    const response = await $fetch<{ features: PhotonFeature[] }>(`${config.photonUrl}/${reverse ? 'reverse' : 'api'}/`, {
      query: reverse ? { lon, lat } : { q, limit: 5, lon: -79.94, lat: 40.46 },
      timeout: 7000,
    })
    return response.features.flatMap((feature, index) => {
      const point = feature.geometry?.coordinates, p = feature.properties
      if (!point || point.length < 2 || !p) return []
      const address = [p.housenumber, p.street].filter(Boolean).join(' ')
      const title = address || p.name || 'Map location'
      const area = p.city || p.state
      return [{ id: String(p.osm_id ?? index), label: area ? `${title}, ${area}` : title, coordinates: [point[0], point[1]] }]
    })
  } catch {
    throw createError({ statusCode: 503, statusMessage: "Search isn't responding. Try again." })
  }
})
