<script setup lang="ts">
import type { ElevationChoice, Mode, Place, PlanningSettings, Surface, Units } from '../domain/planner'
import { MODE_ICONS } from '../domain/planner'
import { clampToMode, elevationCaption, METERS_PER_FOOT } from '../domain/units'
const props = defineProps<{ settings: PlanningSettings; units: Units; elevationAvailable: boolean; placing: 'start' | 'stop' | null; locating: boolean }>()
const emit = defineEmits<{ change: [patch: Partial<PlanningSettings>]; locate: []; placement: [mode: 'start' | 'stop' | null] }>()
const search = ref(''), results = ref<Place[]>([]), searchBusy = ref(false), searchError = ref(''), openSearch = ref(false), activeResult = ref(-1)
const addingStop = ref(false), customGain = ref('')
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')
let timer: ReturnType<typeof setTimeout> | undefined
let searchRequest: AbortController | null = null
let searchVersion = 0
watch(() => props.settings.start?.label, label => { if (!addingStop.value) search.value = label ?? '' }, { immediate: true })
const elevations: { value: ElevationChoice; label: string; icon: string }[] = [
  { value: 'any', label: 'Any', icon: 'ph:infinity' }, { value: 'flat', label: 'Flat', icon: 'ph:minus' },
  { value: 'hilly', label: 'Hilly', icon: 'ph:wave-sine' }, { value: 'steep', label: 'Steep', icon: 'ph:mountains' },
  { value: 'custom', label: 'Custom', icon: 'ph:sliders-horizontal' },
]
const surfaces: { value: Surface; label: string; icon: string }[] = [
  { value: 'paved', label: 'Paved', icon: 'ph:road-horizon' }, { value: 'mixed', label: 'Mixed', icon: 'ph:shuffle' }, { value: 'trail', label: 'Trail', icon: 'ph:tree-evergreen' },
]
const caption = computed(() => elevationCaption(props.settings.elevation, props.settings.distanceMeters, props.units))
function setMode(mode: Mode) { emit('change', { mode, distanceMeters: clampToMode(props.settings.distanceMeters, mode) }) }
function lookup() {
  clearTimeout(timer); searchRequest?.abort(); const version = ++searchVersion
  results.value = []; activeResult.value = -1; searchError.value = ''; openSearch.value = true
  if (search.value.trim().length < 2) { searchBusy.value = false; return }
  searchBusy.value = true
  timer = setTimeout(async () => {
    const request = new AbortController(); searchRequest = request
    try {
      const places = await $fetch<Place[]>('/api/search', { query: { q: search.value }, signal: request.signal })
      if (version === searchVersion) results.value = places
    } catch { if (version === searchVersion && !request.signal.aborted) searchError.value = "Search isn't responding. Try again." }
    finally { if (version === searchVersion) searchBusy.value = false }
  }, 300)
}
function choose(place: Place) {
  searchRequest?.abort(); ++searchVersion; openSearch.value = false; results.value = []
  if (addingStop.value) {
    emit('change', { stops: [...props.settings.stops, place] }); addingStop.value = false; search.value = props.settings.start?.label ?? ''
  } else { search.value = place.label; emit('change', { start: place }) }
  emit('placement', null)
}
async function addStop() { addingStop.value = true; search.value = ''; openSearch.value = false; emit('placement', 'stop'); await nextTick(); searchInput.value?.focus() }
function closeSearch() { openSearch.value = false; addingStop.value = false; search.value = props.settings.start?.label ?? ''; emit('placement', null) }
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { closeSearch(); return }
  if (event.key === 'ArrowDown') { event.preventDefault(); activeResult.value = Math.min(activeResult.value + 1, results.value.length - 1) }
  if (event.key === 'ArrowUp') { event.preventDefault(); activeResult.value = Math.max(0, activeResult.value - 1) }
  if (event.key === 'Enter' && results.value[activeResult.value]) { event.preventDefault(); choose(results.value[activeResult.value]!) }
}
function removeStop(id: string) { emit('change', { stops: props.settings.stops.filter(stop => stop.id !== id) }) }
let draggedStop = -1
function startDrag(event: DragEvent, index: number) {
  draggedStop = index
  event.dataTransfer?.setData('text/plain', String(index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function allowDrop(event: DragEvent) { if (event.dataTransfer) event.dataTransfer.dropEffect = 'move' }
function dropStop(index: number) {
  if (draggedStop < 0 || draggedStop === index) { draggedStop = -1; return }
  const stops = [...props.settings.stops]
  const [stop] = stops.splice(draggedStop, 1)
  draggedStop = -1
  if (stop) emit('change', { stops, orderLocked: true })
}
function chooseElevation(value: ElevationChoice) {
  emit('change', { elevation: value, ...(value === 'custom' ? { customGainMeters: props.settings.customGainMeters ?? 100 } : {}) })
  customGain.value = String(Math.round((props.settings.customGainMeters ?? 100) / (props.units === 'mi' ? METERS_PER_FOOT : 1)))
}
function gainCommit() {
  const value = Number(customGain.value)
  if (Number.isFinite(value) && value >= 0) emit('change', { customGainMeters: value * (props.units === 'mi' ? METERS_PER_FOOT : 1) })
}
onBeforeUnmount(() => { clearTimeout(timer); searchRequest?.abort() })
</script>

<template>
  <div class="planning-controls">
    <div class="mode-picker" role="group" aria-label="Activity">
      <button v-for="mode in (['bike', 'run', 'walk'] as const)" :key="mode" type="button" class="mode-tile pressable" :class="{ selected: settings.mode === mode }" :aria-pressed="settings.mode === mode" @click="setMode(mode)"><Icon :name="MODE_ICONS[mode]" size="20" /><span>{{ mode === 'bike' ? 'Bike' : mode === 'run' ? 'Run' : 'Walk' }}</span></button>
    </div>
    <section class="control-section start-section">
      <div class="section-heading"><button type="button" class="section-label start-label" @click="emit('placement', placing === 'start' ? null : 'start')">{{ addingStop ? 'Add a stop' : 'Start' }}</button><button v-if="placing" type="button" class="text-action" @click="closeSearch">Cancel</button></div>
      <div class="search-combo">
        <div class="search-field" :class="{ focused: placing }"><Icon name="ph:magnifying-glass" size="20" /><input id="start-search" ref="searchInput" v-model="search" role="combobox" :aria-label="addingStop ? 'Search for a stop' : 'Search for a start'" aria-autocomplete="list" :aria-expanded="openSearch" aria-controls="place-results" :aria-activedescendant="activeResult >= 0 ? `place-${activeResult}` : undefined" placeholder="Search for a place" autocomplete="off" @input="lookup" @keydown="keyboard" @focus="openSearch = results.length > 0" /><IconButton :icon="locating ? 'ph:spinner-gap' : 'ph:crosshair-simple'" label="Use my location" :class="{ spinner: locating }" @click="emit('locate')" /></div>
        <ul v-if="openSearch && (results.length || searchBusy || searchError)" id="place-results" role="listbox" class="search-results surface">
          <li v-if="searchBusy" class="search-status">Searching…</li><li v-else-if="searchError" class="search-status danger">{{ searchError }}</li>
          <li v-for="(place, index) in results" :id="`place-${index}`" :key="place.id" role="option" :aria-selected="index === activeResult"><button type="button" :class="{ active: index === activeResult }" @mousedown.prevent="choose(place)"><Icon name="ph:map-pin" size="18" /><span>{{ place.label }}</span></button></li>
        </ul>
      </div>
    </section>
    <section v-if="settings.start" class="control-section stops-section">
      <div class="section-heading"><h2 class="section-label">Stops</h2><IconButton v-if="settings.stops.length" :icon="settings.orderLocked ? 'ph:lock-simple' : 'ph:lock-simple-open'" :label="settings.orderLocked ? 'Unlock stop order' : 'Lock stop order'" :active="settings.orderLocked" class="small-icon" @click="emit('change', { orderLocked: !settings.orderLocked })" /></div>
      <div v-for="(stop, index) in settings.stops" :key="stop.id" class="stop-row" :draggable="settings.stops.length > 1" @dragstart="startDrag($event, index)" @dragover.prevent="allowDrop" @drop.prevent="dropStop(index)"><Icon name="ph:dots-six-vertical" size="16" /><span class="stop-index">{{ index + 1 }}</span><span class="stop-name">{{ stop.label }}</span><IconButton icon="ph:minus-circle" :label="`Remove ${stop.label}`" draggable="false" @dragstart.stop.prevent @click="removeStop(stop.id)" /></div>
      <button v-if="settings.stops.length < 5" type="button" class="add-stop" @click="addStop"><Icon name="ph:plus" size="20" />Add a stop</button>
    </section>
    <DistanceField :meters="settings.distanceMeters" :mode="settings.mode" :units="units" @change="emit('change', { distanceMeters: $event })" />
    <section class="control-section elevation-section"><h2 class="section-label">Elevation</h2><div class="icon-picker" role="group" aria-label="Elevation preference"><button v-for="choice in elevations" :key="choice.value" type="button" class="option-tile pressable" :class="{ selected: settings.elevation === choice.value }" :disabled="choice.value !== 'any' && !elevationAvailable" :aria-pressed="settings.elevation === choice.value" :aria-label="`${choice.label}${choice.value !== 'any' && !elevationAvailable ? ': Unavailable' : ''}`" @click="chooseElevation(choice.value)"><Icon :name="choice.icon" size="20" /><span>{{ choice.label }}</span></button></div><div class="elevation-feedback"><label v-if="settings.elevation === 'custom' && elevationAvailable" class="custom-gain"><span>Gain</span><input v-model="customGain" type="number" min="0" inputmode="numeric" @change="gainCommit" /><span class="unit">{{ units === 'mi' ? 'ft' : 'm' }}</span></label><p v-else class="field-hint">{{ !elevationAvailable ? 'Unavailable' : caption }}</p></div></section>
    <section class="control-section surface-section"><h2 class="section-label">Surface</h2><div class="icon-picker" role="group" aria-label="Surface preference"><button v-for="choice in surfaces" :key="choice.value" type="button" class="option-tile pressable" :class="{ selected: settings.surface === choice.value }" :aria-pressed="settings.surface === choice.value" @click="emit('change', { surface: choice.value })"><Icon :name="choice.icon" size="20" /><span>{{ choice.label }}</span></button></div></section>
    <section class="control-section preferences-section"><h2 class="section-label">Preferences</h2><button type="button" role="switch" :aria-checked="settings.avoidBusyRoads" class="preference-row" @click="emit('change', { avoidBusyRoads: !settings.avoidBusyRoads })"><span>Avoid busy roads</span><span class="toggle" :class="{ on: settings.avoidBusyRoads }"><span /></span></button><button type="button" role="switch" :aria-checked="settings.preferInfrastructure" class="preference-row" @click="emit('change', { preferInfrastructure: !settings.preferInfrastructure })"><span>{{ settings.mode === 'bike' ? 'Prefer bike lanes' : 'Prefer sidewalks' }}</span><span class="toggle" :class="{ on: settings.preferInfrastructure }"><span /></span></button></section>
  </div>
</template>
