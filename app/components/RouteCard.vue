<script setup lang="ts">
import type { Mode, RouteCandidate, Units } from '../domain/planner'
import { distanceText, gainText, minutesFor, PACE_LIMITS, paceFromInput, paceSuffix, paceText } from '../domain/units'
const props = defineProps<{ route: RouteCandidate; selected: boolean; hovered: boolean; saved: boolean; units: Units; pace: Record<Mode, number> }>()
const emit = defineEmits<{ select: [id: string, deliberate: boolean]; preview: [id: string]; save: [route: RouteCandidate]; reverse: []; pace: [mode: Mode, value: number] }>()
const editingPace = ref(false)
const paceValue = ref('')
/** Focuses the pace box as it opens, selecting the number so typing replaces it. */
const vFocus = { mounted: (element: HTMLInputElement) => { element.focus(); element.select() } }
function editPace() { paceValue.value = paceText(props.pace[props.route.mode], props.units); editingPace.value = true }
function cancelPace() { editingPace.value = false }
function commitPace() {
  // Enter, blur and Escape can all reach here. Only the first one for an open edit counts.
  if (!editingPace.value) return
  editingPace.value = false
  const value = paceFromInput(Number(paceValue.value), props.units)
  // An empty box reads as 0, which is below the minimum, so it keeps the current pace.
  if (Number.isFinite(value) && value >= PACE_LIMITS.minimum && value <= PACE_LIMITS.maximum) emit('pace', props.route.mode, value)
}
</script>

<template>
  <article class="route-card surface" :class="{ selected, hovered }" @mouseenter="emit('preview', route.id)" @mouseleave="emit('preview', '')">
    <button type="button" class="route-card-select" :aria-label="`Select ${route.name}`" :aria-pressed="selected" @click="emit('select', route.id, true)" />
    <div class="route-card-header"><h2>{{ route.name }}</h2><div class="route-card-actions"><IconButton v-if="selected" icon="ph:arrows-counter-clockwise" label="Reverse route" side="above" @click="emit('reverse')" /><IconButton class="save-bookmark" :class="{ saved }" :icon="saved ? 'ph:bookmark-simple-fill' : 'ph:bookmark-simple'" :label="saved ? 'Delete saved route' : 'Save route'" side="above" :aria-pressed="saved" @click="emit('save', route)" /></div></div>
    <div class="route-distance"><span>{{ distanceText(route.distanceMeters, units) }}</span><span class="unit distance-unit">{{ units }}</span></div>
    <div class="route-stats">
      <span class="stat"><Icon name="ph:wave-sine" size="16" /><span class="stat-value">{{ gainText(route.gainMeters, units) }}</span><span v-if="route.gainMeters !== null" class="unit">{{ units === 'mi' ? 'ft' : 'm' }}</span></span>
      <span v-if="editingPace" class="stat pace-stat"><Icon name="ph:timer" size="16" /><input v-model="paceValue" v-focus class="pace-input" type="number" inputmode="decimal" step="any" min="0" aria-label="Pace" @keydown.enter.prevent="commitPace" @keydown.esc="cancelPace" @blur="commitPace" /><span class="unit">{{ paceSuffix(units) }}</span></span>
      <button v-else type="button" class="stat time-button" aria-label="Edit pace" data-tooltip="Edit pace" @click="editPace"><Icon name="ph:timer" size="16" /><span class="stat-value">{{ minutesFor(route.distanceMeters, route.mode, pace) }}</span><span class="unit">min</span></button>
    </div>
  </article>
</template>
