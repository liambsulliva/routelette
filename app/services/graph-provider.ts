import type { GraphManifest, GraphTileProvider } from '../domain/planner'

export function createStaticGraphProvider(manifestUrl: string): GraphTileProvider {
  const manifests = new Map<string, GraphManifest>()
  return {
    async manifest(signal) {
      const response = await fetch(manifestUrl, { signal })
      if (!response.ok) throw new Error('Routing snapshot is unavailable.')
      const data: unknown = await response.json()
      if (!data || typeof data !== 'object' || !('schemaVersion' in data) || data.schemaVersion !== 1
        || !('version' in data) || typeof data.version !== 'string' || !('regions' in data) || !Array.isArray(data.regions)) {
        throw new Error('Routing snapshot format is not supported.')
      }
      const manifest = data as GraphManifest
      manifests.set(manifest.version, manifest)
      return manifest
    },
    async tile(version, id, signal) {
      const manifest = manifests.get(version)
      if (!manifest || !manifest.regions.some(region => region.tiles.includes(id))) {
        throw new Error('Tile is not part of this routing snapshot.')
      }
      const url = new URL(`${encodeURIComponent(version)}/${encodeURIComponent(id)}.bin`, new URL('.', manifestUrl))
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error('Routing tile is unavailable.')
      return response.arrayBuffer()
    },
  }
}
