<script setup lang="ts">
import type { Coordinates, Mode, Place, PlanningSettings, RouteCandidate, Units } from './domain/planner'
import { MODE_ICONS } from './domain/planner'
import { createPlanner } from './domain/controller'
import { distanceText, gainText, minutesFor, toDistance, METERS_PER_MILE } from './domain/units'
import { createFixturePlanner, createUnavailablePlanner, PREVIEW_START, PREVIEW_STOP, previewRoutes, previewSavedRoutes } from './services/fixture-planner'
import { createSavedRoutes } from './services/saved-routes'
import { encodeRoute, decodeRoute } from './services/share'

const config = useRuntimeConfig()
const fixtureMode = config.public.fixtureMode === true || String(config.public.fixtureMode) === 'true'
const planner = createPlanner(fixtureMode ? createFixturePlanner() : createUnavailablePlanner())
const { state, selected } = planner
const tab = ref<'plan' | 'saved'>('plan'), shared = ref(false), expanded = ref(false), legendOpen = ref(false)
const theme = ref<'light' | 'dark' | 'system'>('system'), systemDark = ref(false), units = ref<Units>('mi'), reducedMotion = ref(false)
const dark = computed(() => theme.value === 'dark' || theme.value === 'system' && systemDark.value)
const pace = reactive<Record<Mode, number>>({ bike: 5, run: 9.5, walk: 20 })
const mobile = ref(false), panelHeight = ref(94), placing = ref<'start' | 'stop' | null>(null), locating = ref(false)
const saved = ref<RouteCandidate[]>([]), savedSelectedId = ref(''), renamingId = ref(''), renameValue = ref(''), toast = ref('')
const deleted = ref<{ route: RouteCandidate; index: number } | null>(null), hydrated = ref(false)
const highlighted = ref<Coordinates[]>([]), stravaState = ref<'idle' | 'loading' | 'done'>('idle')
const panel = useTemplateRef<HTMLElement>('panel')
const repository = createSavedRoutes()
let undoTimer: ReturnType<typeof setTimeout> | undefined, toastTimer: ReturnType<typeof setTimeout> | undefined
let resizeObserver: ResizeObserver | undefined
let startSelectionVersion = 0
const disposers: Array<() => void> = []
const activeSaved = computed(() => saved.value.find(route => route.id === savedSelectedId.value) ?? null)
const visibleRoutes = computed(() => tab.value === 'saved' && !shared.value ? (activeSaved.value ? [activeSaved.value] : []) : state.routes)
const activeRoute = computed(() => tab.value === 'saved' && !shared.value ? activeSaved.value : selected.value)
const cardsVisible = computed(() => !shared.value && tab.value === 'plan' && state.routes.length > 0 && !(mobile.value && expanded.value))
const scene = computed(() => ({
  routes: visibleRoutes.value, selectedId: activeRoute.value?.id ?? '',
  start: tab.value === 'saved' ? activeSaved.value?.settings.start ?? null : state.settings.start,
  stops: tab.value === 'saved' ? [] : state.settings.stops,
  joints: tab.value === 'saved' ? [] : state.settings.joints,
}))
const sceneRevision = computed(() => state.revision + (tab.value === 'saved' ? saved.value.length + saved.value.findIndex(r => r.id === savedSelectedId.value) + 1000 : 0))
function showToast(message: string) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 5000) }
watch(() => state.toast, message => { if (message) { showToast(message); state.toast = '' } })
function cycleTheme() { theme.value = theme.value === 'system' ? 'light' : theme.value === 'light' ? 'dark' : 'system' }
async function change(patch: Partial<PlanningSettings>) { if (patch.start) ++startSelectionVersion; placing.value = null; await planner.change(patch) }
function toggleExpanded() { expanded.value = !expanded.value; if (expanded.value) legendOpen.value = false }
function switchTab(next: 'plan' | 'saved') {
  planner.cancel(); tab.value = next; state.revision++; legendOpen.value = false
  if (next === 'saved') { savedSelectedId.value ||= saved.value[0]?.id ?? ''; expanded.value = true }
}
function selectRoute(id: string, deliberate: boolean) {
  if (!state.busy && state.selectedId === id) return
  planner.select(id, deliberate)
}
async function mapClick(point: Coordinates, routeId?: string) {
  if (shared.value || tab.value === 'saved') return
  if (placing.value === 'stop') { await addMapStop(point); return }
  if (placing.value === 'start' || !state.settings.start) {
    const version = ++startSelectionVersion
    const place: Place = { id: `map-${point.join(',')}`, label: `${point[1].toFixed(5)}, ${point[0].toFixed(5)}`, coordinates: point }
    placing.value = null
    try {
      const names = await $fetch<Place[]>('/api/search', { query: { reverse: 1, lon: point[0], lat: point[1] } })
      if (names[0]) place.label = names[0].label
    } catch { /* Coordinates remain a usable label when reverse lookup is unavailable. */ }
    if (version === startSelectionVersion) await change({ start: place }); return
  }
  if (routeId && routeId !== state.selectedId || routeId && state.busy) { selectRoute(routeId, true); return }
  if (routeId && state.settings.joints.length < 10) {
    state.settings.joints = [...state.settings.joints, point]; state.presentation = 'selection'; state.revision++
  }
}
async function addMapStop(point: Coordinates) {
  if (!state.settings.start || state.settings.stops.length >= 5) return
  placing.value = null
  await change({ stops: [...state.settings.stops, { id: `stop-${Date.now()}`, label: `${point[1].toFixed(5)}, ${point[0].toFixed(5)}`, coordinates: point }] })
}
function locate() {
  if (!navigator.geolocation) { state.error = 'Location is off. Search for a start instead.'; return }
  locating.value = true
  navigator.geolocation.getCurrentPosition(position => {
    locating.value = false; void mapClick([position.coords.longitude, position.coords.latitude])
  }, () => { locating.value = false; state.error = 'Location is off. Search for a start instead.' }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
  placing.value = 'start'
}
function preview(which: 'results' | 'saved' = 'results') {
  shared.value = false; tab.value = 'plan'
  const routes = previewRoutes(); planner.load(routes)
  state.settings.start = PREVIEW_START; state.settings.stops = [PREVIEW_STOP]; state.settings.distanceMeters = 1.5 * METERS_PER_MILE
  state.settings.seed = 0; state.presentation = 'generate'; state.revision++
  if (which === 'saved') { saved.value = previewSavedRoutes(); savedSelectedId.value = saved.value[0]?.id ?? ''; switchTab('saved') }
}
async function persistSaved() {
  try { await repository.save(saved.value) } catch { showToast("Couldn't save on this device. Browser storage may be full.") }
}
function isSaved(route: RouteCandidate) { return saved.value.some(item => item.coordinates.length === route.coordinates.length && item.coordinates.every((point, i) => point[0] === route.coordinates[i]?.[0] && point[1] === route.coordinates[i]?.[1])) }
async function saveRoute(route: RouteCandidate) {
  if (isSaved(route)) { showToast('Saved on this device.'); return }
  const copy = JSON.parse(JSON.stringify(route)) as RouteCandidate
  copy.id = `saved-${crypto.randomUUID()}`
  copy.name = route.turns.reduce((longest, turn) => turn.distanceMeters > longest.distanceMeters ? turn : longest, route.turns[0] ?? { street: 'Bloomfield', distanceMeters: 0 }).street.replace(/ Avenue$/, ' Ave').replace(/ Street$/, ' St') + ' loop'
  saved.value.unshift(copy); await persistSaved(); showToast('Route saved.')
}
function chooseSaved(route: RouteCandidate) { planner.cancel(); savedSelectedId.value = route.id; state.presentation = 'restore'; state.revision++; legendOpen.value = false }
function rename(route: RouteCandidate) { renamingId.value = route.id; renameValue.value = route.name }
async function commitRename(route: RouteCandidate) { if (renameValue.value.trim()) route.name = renameValue.value.trim().slice(0, 120); renamingId.value = ''; await persistSaved() }
async function removeSaved(route: RouteCandidate) {
  clearTimeout(undoTimer)
  const index = saved.value.findIndex(item => item.id === route.id); if (index < 0) return
  deleted.value = { route, index }; saved.value.splice(index, 1)
  if (savedSelectedId.value === route.id) savedSelectedId.value = saved.value[0]?.id ?? ''
  state.revision++; await persistSaved(); undoTimer = setTimeout(() => { deleted.value = null }, 5000)
}
async function undoDelete() { if (!deleted.value) return; clearTimeout(undoTimer); saved.value.splice(deleted.value.index, 0, deleted.value.route); deleted.value = null; await persistSaved() }
async function shareRoute(route: RouteCandidate, copyOnly = false) {
  try {
    const url = `${window.location.origin}/r#${encodeRoute(route)}`
    if (!copyOnly && navigator.share) { try { await navigator.share({ title: route.name, url }); return } catch (error) { if (error instanceof Error && error.name === 'AbortError') return } }
    await navigator.clipboard.writeText(url); showToast('Link copied.')
  } catch (error) { showToast(error instanceof Error ? error.message : "Couldn't copy the link.") }
}
async function reverseRoute() {
  if (tab.value === 'saved') { state.error = 'Legal reversal needs the regional routing snapshots.'; return }
  await planner.run('reverse')
}
function planOwn() { shared.value = false; state.routes = []; state.selectedId = ''; state.revision++; window.history.replaceState(null, '', '/'); void planner.run() }
function importStrava() { showToast('Strava import will be available after the routing stage.'); }

onMounted(async () => {
  const watchMedia = (query: string, callback: (matches: boolean) => void) => {
    const media = window.matchMedia(query); callback(media.matches)
    const listener = () => callback(media.matches); media.addEventListener('change', listener); disposers.push(() => media.removeEventListener('change', listener))
  }
  watchMedia('(max-width: 767px)', value => { mobile.value = value })
  watchMedia('(prefers-color-scheme: dark)', value => { systemDark.value = value })
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  try {
    const stored = JSON.parse(localStorage.getItem('routelette:preferences:v1') ?? 'null')
    if (stored) {
      if (['system', 'light', 'dark'].includes(stored.theme)) theme.value = stored.theme
      if (stored.units === 'mi' || stored.units === 'km') units.value = stored.units
      if (typeof stored.reducedMotion === 'boolean') reducedMotion.value = stored.reducedMotion
      for (const mode of ['bike', 'run', 'walk'] as const) if (typeof stored.pace?.[mode] === 'number' && stored.pace[mode] > 0) pace[mode] = stored.pace[mode]
      if (typeof stored.avoidBusyRoads === 'boolean') state.settings.avoidBusyRoads = stored.avoidBusyRoads
      if (typeof stored.preferInfrastructure === 'boolean') state.settings.preferInfrastructure = stored.preferInfrastructure
    } else units.value = /-(US|LR|MM)\b/i.test(navigator.language) ? 'mi' : 'km'
    saved.value = await repository.load()
  } catch { /* Defaults also work when browser storage is unavailable. */ }
  const query = new URLSearchParams(window.location.search)
  if (query.get('theme') === 'light' || query.get('theme') === 'dark') theme.value = query.get('theme') as 'light' | 'dark'
  if (fixtureMode && query.has('preview')) preview(query.get('preview') === 'saved' ? 'saved' : 'results')
  if (query.get('expanded') === '1') expanded.value = true
  if (window.location.pathname === '/r') {
    const route = decodeRoute(window.location.hash.slice(1))
    if (route) { shared.value = true; tab.value = 'plan'; planner.load([route]); expanded.value = true }
    else state.error = 'This route link could not be opened.'
  }
  hydrated.value = true
  await nextTick()
  if (panel.value) { resizeObserver = new ResizeObserver(entries => { if (entries[0]) panelHeight.value = entries[0].contentRect.height + 32 }); resizeObserver.observe(panel.value) }
})
watch([dark, reducedMotion], () => {
  if (!import.meta.client) return
  document.documentElement.dataset.theme = dark.value ? 'dark' : 'light'
  document.documentElement.dataset.reducedMotion = String(reducedMotion.value)
}, { immediate: true })
watch([theme, units, reducedMotion, pace, () => state.settings.avoidBusyRoads, () => state.settings.preferInfrastructure], () => {
  if (!import.meta.client || !hydrated.value) return
  try { localStorage.setItem('routelette:preferences:v1', JSON.stringify({ theme: theme.value, units: units.value, reducedMotion: reducedMotion.value, pace, avoidBusyRoads: state.settings.avoidBusyRoads, preferInfrastructure: state.settings.preferInfrastructure })) } catch { /* Settings remain usable without persistence. */ }
}, { deep: true })
onBeforeUnmount(() => { planner.dispose(); resizeObserver?.disconnect(); disposers.forEach(dispose => dispose()); clearTimeout(undoTimer); clearTimeout(toastTimer) })
</script>

<template>
  <main class="planner-app" :class="{ 'is-mobile': mobile, 'has-start': !!state.settings.start, 'has-cards': cardsVisible, 'sheet-expanded': expanded, 'saved-view': tab === 'saved', 'shared-view': shared }" :style="{ '--sheet-height': `${panelHeight}px` }">
    <ClientOnly><LazyMapView :scene="scene" :dark="dark" :reduced-motion="reducedMotion" :revision="sceneRevision" :presentation="state.presentation" :mobile="mobile" :panel-height="panelHeight" :cards="cardsVisible" :highlighted="highlighted" @click="mapClick" @select="selectRoute($event, true)" @joint="planner.dropJoint" @longpress="addMapStop" /></ClientOnly>
    <div v-if="fixtureMode && !shared" class="preview-badge"><span>Design preview</span><span class="preview-separator">·</span><button type="button" @click="preview('results')">Preview Bloomfield</button></div>
    <div class="mobile-header surface"><AppHeader :theme="theme" :dark="dark" :units="units" :reduced-motion="reducedMotion" @theme="cycleTheme" @units="units = units === 'mi' ? 'km' : 'mi'" @motion="reducedMotion = !reducedMotion" /></div>
    <section ref="panel" class="planner-panel surface" :class="{ expanded: expanded || shared, saved: tab === 'saved' }" aria-label="Route planner">
      <div class="desktop-header"><AppHeader :theme="theme" :dark="dark" :units="units" :reduced-motion="reducedMotion" @theme="cycleTheme" @units="units = units === 'mi' ? 'km' : 'mi'" @motion="reducedMotion = !reducedMotion" /></div>
      <button v-if="!shared" type="button" class="sheet-grabber" :aria-label="expanded ? 'Collapse planner' : 'Expand planner'" :aria-expanded="expanded" @click="toggleExpanded"><span /></button>
      <template v-if="shared && activeRoute">
        <div class="shared-content"><p class="section-label">Shared route</p><h1>{{ activeRoute.name }}</h1><p class="shared-mode"><Icon :name="MODE_ICONS[activeRoute.mode]" size="20" />{{ activeRoute.mode === 'bike' ? 'Bike' : activeRoute.mode === 'walk' ? 'Walk' : 'Run' }} · {{ activeRoute.provenance.region }}</p><div class="shared-stats"><div><strong>{{ distanceText(activeRoute.distanceMeters, units) }}<span class="unit distance-unit">{{ units }}</span></strong><span>Distance</span></div><div><strong>{{ gainText(activeRoute.gainMeters, units) }}<span class="unit">{{ units === 'mi' ? 'ft' : 'm' }}</span></strong><span>Gain</span></div><div><strong>{{ minutesFor(activeRoute.distanceMeters, activeRoute.mode, pace) }}<span class="unit">min</span></strong><span>Time</span></div></div><p>A loop from {{ activeRoute.settings.start?.label }}. Open it in Routelette to roll your own from here.</p><div class="shared-actions"><RollButton label="Plan your own" @click="planOwn" /><div class="outline-actions"><button type="button" @click="shareRoute(activeRoute, true)"><Icon name="ph:export" size="20" />Copy link</button><button type="button" @click="reverseRoute"><Icon name="ph:arrows-counter-clockwise" size="20" />Reverse</button></div></div></div>
      </template>
      <template v-else>
        <nav class="panel-tabs" aria-label="Planner views"><button type="button" :class="{ active: tab === 'plan' }" :aria-current="tab === 'plan' ? 'page' : undefined" @click="switchTab('plan')"><Icon name="ph:map-trifold" size="20" />Plan</button><button type="button" :class="{ active: tab === 'saved' }" :aria-current="tab === 'saved' ? 'page' : undefined" @click="switchTab('saved')"><Icon name="ph:bookmark-simple" size="20" />Saved</button></nav>
        <template v-if="tab === 'plan'">
          <div class="plan-scroll"><PlanControls :settings="state.settings" :units="units" :elevation-available="state.elevationAvailable" :placing="placing" :locating="locating" @change="change" @placement="placing = $event" @locate="locate" /></div>
          <div v-if="state.error" class="error-line" role="status"><Icon name="ph:warning-circle" size="20" /><span>{{ state.error }}</span><button v-if="!fixtureMode" type="button" @click="planner.run()">Retry</button></div>
          <div class="roll-action"><button type="button" class="mobile-summary" aria-label="Expand route settings" @click="toggleExpanded"><span class="summary-mode"><Icon :name="MODE_ICONS[state.settings.mode]" size="20" /></span><span class="summary-distance">{{ distanceText(state.settings.distanceMeters, units) }}<span class="unit distance-unit">{{ units }}</span></span></button><RollButton :busy="state.busy" :disabled="!state.settings.start" @click="planner.roll()" /></div>
        </template>
        <template v-else>
          <div class="saved-content"><div class="saved-heading"><p>{{ saved.length }} saved {{ saved.length === 1 ? 'route' : 'routes' }}</p><p>Saved on this device only.</p></div><p v-if="!saved.length" class="empty-saved">Saved routes will appear here.</p>
            <template v-for="(route, index) in saved" :key="route.id"><div v-if="deleted && deleted.index === index" class="deleted-row"><Icon name="ph:trash" size="16" /><span>{{ deleted.route.name }} deleted</span><button type="button" @click="undoDelete">Undo</button></div><article class="saved-route" :class="{ selected: savedSelectedId === route.id }"><button type="button" class="saved-select" :aria-label="`Select ${route.name}`" :aria-pressed="savedSelectedId === route.id" @click="chooseSaved(route)"><RouteThumbnail :coordinates="route.coordinates" /><span class="saved-details"><span class="saved-name">{{ route.name }}</span><span class="saved-specs"><Icon :name="MODE_ICONS[route.mode]" size="16" /><span>{{ distanceText(route.distanceMeters, units) }} <span class="unit distance-unit">{{ units }}</span></span><span>{{ gainText(route.gainMeters, units) }} <span class="unit">{{ units === 'mi' ? 'ft' : 'm' }}</span></span><span>{{ minutesFor(route.distanceMeters, route.mode, pace) }} <span class="unit">min</span></span></span></span></button>
              <form v-if="renamingId === route.id" class="rename-editor" @submit.prevent="commitRename(route)"><input v-model="renameValue" aria-label="Route name" maxlength="120" @keydown.esc="renamingId = ''" /><button type="submit">Done</button></form>
              <div v-if="savedSelectedId === route.id" class="saved-row-actions"><IconButton icon="ph:pencil-simple" label="Rename route" @click="rename(route)" /><IconButton icon="ph:arrows-counter-clockwise" label="Reverse route" @click="reverseRoute" /><IconButton icon="ph:export" label="Share route" @click="shareRoute(route)" /><IconButton icon="ph:trash" label="Delete route" danger @click="removeSaved(route)" /></div>
            </article></template>
            <div v-if="deleted && deleted.index >= saved.length" class="deleted-row"><Icon name="ph:trash" size="16" /><span>{{ deleted.route.name }} deleted</span><button type="button" @click="undoDelete">Undo</button></div>
          </div>
          <div v-if="state.error" class="error-line" role="status"><Icon name="ph:warning-circle" size="20" /><span>{{ state.error }}</span></div>
          <StravaImportButton :dark="dark" :state="stravaState" @click="importStrava" />
        </template>
      </template>
      <AppFooter />
    </section>
    <div v-if="cardsVisible" class="route-cards" aria-label="Route options"><RouteCard v-for="route in state.routes" :key="route.id" :route="route" :selected="route.id === state.selectedId" :saved="isSaved(route)" :units="units" :pace="pace" @select="selectRoute" @save="saveRoute" @pace="(mode, value) => pace[mode] = value" /></div>
    <RouteLegend v-if="activeRoute && !(mobile && expanded && tab === 'plan' && !shared)" :route="activeRoute" :units="units" :open="legendOpen" :mobile="mobile" :pace="pace" @toggle="legendOpen = !legendOpen; if (legendOpen && mobile) expanded = false" @highlight="highlighted = $event" />
    <Transition name="toast"><div v-if="toast" class="toast-message surface" role="status"><Icon name="ph:info" size="20" /><span>{{ toast }}</span><IconButton icon="ph:x" label="Dismiss message" @click="toast = ''" /></div></Transition>
  </main>
</template>
