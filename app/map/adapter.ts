import maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as LibreMap, Marker } from 'maplibre-gl'
import type { FeatureCollection, LineString } from 'geojson'
import type { Coordinates, Place, RouteCandidate } from '../domain/planner'

export interface MapScene { routes: RouteCandidate[]; selectedId: string; hoveredId?: string; start: Place | null; stops: Place[]; joints: Coordinates[] }
export interface MapEvents {
  click(point: Coordinates, routeId?: string): void
  hover(routeId: string): void
  select(routeId: string): void
  jointDrop(index: number, point: Coordinates): void
  longPress(point: Coordinates): void
}
export interface Presentation { animate: boolean; fit: boolean; reveal: boolean; deferAlternates: boolean; mobile: boolean; panelHeight: number; cards: boolean }
export interface MapAdapter {
  render(scene: MapScene, presentation: Presentation): void
  theme(dark: boolean): void
  fly(point: Coordinates, animate: boolean): void
  highlight(coordinates: Coordinates[]): void
  emphasize(routeId: string): void
  destroy(): void
}
const empty = (): FeatureCollection<LineString> => ({ type: 'FeatureCollection', features: [] })
const COLORS = { light: { accent: '#c85a17', muted: '#6b6e73', hover: '#878a8f' }, dark: { accent: '#e0763a', muted: '#9a9da2', hover: '#b6b9be' } }

function partial(coordinates: Coordinates[], fraction: number): Coordinates[] {
  if (fraction >= 1) return coordinates
  if (coordinates.length < 2) return coordinates
  const lengths = [0]
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1]!, b = coordinates[i]!
    lengths.push(lengths[i - 1]! + Math.hypot((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]))
  }
  const target = lengths.at(-1)! * fraction
  const end = Math.max(1, lengths.findIndex(length => length >= target))
  const a = coordinates[end - 1]!, b = coordinates[end]!
  const t = (target - lengths[end - 1]!) / (lengths[end]! - lengths[end - 1]! || 1)
  return [...coordinates.slice(0, end), [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]]
}
function features(scene: MapScene, progress: number, dark: boolean, deferAlternates = false, alternateOpacity = 1): FeatureCollection<LineString> {
  const palette = dark ? COLORS.dark : COLORS.light
  return {
    type: 'FeatureCollection',
    features: scene.routes.filter(route => !deferAlternates || progress >= 1 || route.id === scene.selectedId).sort((a, b) => Number(a.id === scene.selectedId) - Number(b.id === scene.selectedId)).map(route => {
      const selected = route.id === scene.selectedId
      const hovered = !selected && route.id === scene.hoveredId
      return {
        type: 'Feature' as const, properties: { id: route.id, selected, color: selected ? palette.accent : hovered ? palette.hover : palette.muted, opacity: selected ? 1 : (hovered ? 0.8 : 0.55) * alternateOpacity },
        geometry: { type: 'LineString' as const, coordinates: selected ? partial(route.coordinates, progress) : route.coordinates },
      }
    }),
  }
}

export function createMapAdapter(container: HTMLElement, events: MapEvents, dark: boolean, ready: () => void, failed: () => void): MapAdapter {
  let isDark = dark, loaded = false, scene: MapScene = { routes: [], selectedId: '', start: null, stops: [], joints: [] }
  let options: Presentation = { animate: false, fit: false, reveal: false, deferAlternates: false, mobile: false, panelHeight: 0, cards: false }
  let frame = 0, cameraVersion = 0, markers: Marker[] = [], destroyed = false, fitting = false
  const map: LibreMap = new maplibregl.Map({
    container, style: `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`,
    center: [-79.94719696521739, 40.46194956108276], zoom: 14.78503297392112, attributionControl: false, pitchWithRotate: false, dragRotate: false,
  })
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
  map.touchZoomRotate.disableRotation()
  function ensureSources() {
    if (!map.getSource('routes')) map.addSource('routes', { type: 'geojson', data: empty() })
    if (!map.getLayer('route-lines')) map.addLayer({ id: 'route-lines', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: {
      'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 5, 3.5],
      'line-opacity': ['get', 'opacity'], 'line-opacity-transition': { duration: 0 },
    } })
    if (!map.getSource('highlight')) map.addSource('highlight', { type: 'geojson', data: empty() })
    if (!map.getLayer('turn-highlight')) map.addLayer({ id: 'turn-highlight', type: 'line', source: 'highlight', layout: { 'line-cap': 'round' }, paint: { 'line-color': isDark ? '#f2f1ef' : '#1f2124', 'line-width': 8, 'line-opacity': 0.7 } })
  }
  let drawnProgress = 1, drawnFade = 1
  function setLines(progress: number, alternateOpacity = 1) {
    drawnProgress = progress; drawnFade = alternateOpacity
    ;(map.getSource('routes') as GeoJSONSource | undefined)?.setData(features(scene, progress, isDark, options.deferAlternates, alternateOpacity))
  }
  function markerElement(className: string, text = '') { const element = document.createElement('div'); element.className = className; element.textContent = text; return element }
  function drawMarkers(includeRouteNumbers = true) {
    markers.forEach(marker => marker.remove()); markers = []
    if (scene.start) markers.push(new maplibregl.Marker({ element: markerElement('map-marker start') }).setLngLat(scene.start.coordinates).addTo(map))
    scene.stops.forEach((stop, index) => markers.push(new maplibregl.Marker({ element: markerElement('map-marker stop', String(index + 1)) }).setLngLat(stop.coordinates).addTo(map)))
    scene.joints.forEach((point, index) => {
      const marker = new maplibregl.Marker({ element: markerElement('map-marker joint'), draggable: true }).setLngLat(point).addTo(map)
      marker.on('dragend', () => { const point = marker.getLngLat(); events.jointDrop(index, [point.lng, point.lat]) })
      markers.push(marker)
    })
    if (!includeRouteNumbers || scene.routes.length < 2) return
    scene.routes.forEach((route, index) => {
      const start = scene.start?.coordinates ?? route.coordinates[0]!
      const farthest = route.coordinates.reduce((best, point) => {
        const distance = (p: Coordinates) => (p[0] - start[0]) ** 2 + (p[1] - start[1]) ** 2
        return distance(point) > distance(best) ? point : best
      }, route.coordinates[0]!)
      const element = markerElement(`map-marker route${route.id === scene.selectedId ? ' selected' : ''}`, String(index + 1))
      element.setAttribute('role', 'button'); element.setAttribute('tabindex', '0'); element.setAttribute('aria-label', `Select ${route.name}`)
      element.addEventListener('mouseenter', () => hoverRoute(route.id))
      element.addEventListener('mouseleave', () => hoverRoute(''))
      element.addEventListener('click', event => { event.stopPropagation(); events.select(route.id) })
      element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); events.select(route.id) } })
      markers.push(new maplibregl.Marker({ element }).setLngLat(farthest).addTo(map))
    })
  }
  function reveal(version: number) {
    if (destroyed || version !== cameraVersion) return
    if (!options.animate || !options.reveal) { setLines(1); drawMarkers(); return }
    const started = performance.now()
    drawMarkers(false)
    const step = (now: number) => {
      if (destroyed || version !== cameraVersion) return
      const elapsed = now - started
      const progress = Math.min(1, elapsed / 300)
      const fade = options.deferAlternates ? Math.min(1, Math.max(0, (elapsed - 300) / 200)) : 1
      const easedFade = fade * fade * (3 - 2 * fade)
      setLines(progress, easedFade)
      if (progress < 1 || fade < 1) frame = requestAnimationFrame(step)
      else drawMarkers()
    }
    frame = requestAnimationFrame(step)
  }
  function draw() {
    if (!loaded || destroyed) return
    const version = ++cameraVersion
    cancelAnimationFrame(frame); fitting = false; map.stop(); ensureSources()
    if (!scene.routes.length) { setLines(1); drawMarkers(); return }
    if (options.fit) {
      const points = scene.routes.flatMap(route => route.coordinates)
      const bounds = new maplibregl.LngLatBounds(points[0]!, points[0]!)
      points.forEach(point => bounds.extend(point))
      if (options.reveal && options.animate) { setLines(0); drawMarkers(false) } else setLines(1)
      const padding = options.mobile
        ? { top: 96, right: 32, bottom: options.panelHeight + (options.cards ? 160 : 20) + 32, left: 32 }
        : { top: 100, right: 120, bottom: options.cards ? 220 : 80, left: 432 }
      const availableHeight = container.clientHeight - padding.top - padding.bottom
      if (availableHeight < 80) padding.bottom = Math.max(32, container.clientHeight - padding.top - 100)
      if (options.animate) { fitting = true; map.once('moveend', () => { if (version === cameraVersion) fitting = false; reveal(version) }); map.fitBounds(bounds, { padding, maxZoom: 15.4, duration: 450 }) }
      else { map.fitBounds(bounds, { padding, maxZoom: 15.4, duration: 0 }); reveal(version) }
    } else reveal(version)
  }
  map.on('load', () => { loaded = true; ensureSources(); draw(); ready() })
  map.on('style.load', () => { if (loaded) { ensureSources(); setLines(1); drawMarkers() } })
  map.on('error', () => { if (!loaded) failed() })
  let suppressClickUntil = 0
  let hoveredRoute = ''
  function hoverRoute(id: string) {
    if (id === hoveredRoute) return
    hoveredRoute = id
    events.hover(id)
    map.getCanvas().style.cursor = id ? 'pointer' : ''
  }
  function routeAt(point: maplibregl.Point) {
    if (!loaded || !map.getLayer('route-lines')) return ''
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [[point.x - 8, point.y - 8], [point.x + 8, point.y + 8]]
    const hit = map.queryRenderedFeatures(box, { layers: ['route-lines'] }).find(feature => typeof feature.properties.id === 'string')
    return typeof hit?.properties.id === 'string' ? hit.properties.id : ''
  }
  map.on('click', event => {
    if (performance.now() < suppressClickUntil) return
    events.click([event.lngLat.lng, event.lngLat.lat], routeAt(event.point))
  })
  map.on('mousemove', event => hoverRoute(routeAt(event.point)))
  map.on('mouseout', () => hoverRoute(''))
  map.on('dragstart', () => { if (fitting) map.stop() })
  let longPress: ReturnType<typeof setTimeout> | undefined
  map.on('touchstart', event => { if (event.lngLats.length === 1) longPress = setTimeout(() => { const p = event.lngLats[0]; if (p) { suppressClickUntil = performance.now() + 1000; events.longPress([p.lng, p.lat]) } }, 600) })
  map.on('touchmove', () => clearTimeout(longPress)); map.on('touchend', () => clearTimeout(longPress))
  return {
    render(nextScene, nextOptions) { scene = nextScene; options = nextOptions; draw() },
    theme(nextDark) { if (nextDark === isDark) return; isDark = nextDark; map.setStyle(`https://tiles.openfreemap.org/styles/${isDark ? 'dark' : 'positron'}`) },
    fly(point, animate) { if (loaded) map.flyTo({ center: point, zoom: 14.5, duration: animate ? 450 : 0, padding: { left: options.mobile ? 0 : 360, right: 0, top: 0, bottom: options.mobile ? options.panelHeight : 0 } }) },
    highlight(coordinates) { if (!loaded) return; (map.getSource('highlight') as GeoJSONSource | undefined)?.setData(coordinates.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] } : empty()) },
    emphasize(routeId) { scene = { ...scene, hoveredId: routeId }; if (loaded && map.getSource('routes')) setLines(drawnProgress, drawnFade) },
    destroy() { destroyed = true; ++cameraVersion; cancelAnimationFrame(frame); clearTimeout(longPress); markers.forEach(marker => marker.remove()); map.remove() },
  }
}
