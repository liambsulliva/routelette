<script setup lang="ts">
import type { Mode, RouteCandidate, Units } from '../domain/planner'
import { distanceText, gainText, minutesFor } from '../domain/units'
const props = defineProps<{ route: RouteCandidate; selected: boolean; hovered: boolean; saved: boolean; units: Units; pace: Record<Mode, number> }>()
const emit = defineEmits<{ select: [id: string, deliberate: boolean]; preview: [id: string]; save: [route: RouteCandidate]; pace: [mode: Mode, value: number] }>()
const editingPace = ref(false)
const paceValue = ref('')
function editPace() { paceValue.value = String(props.pace[props.route.mode]); editingPace.value = true }
function commitPace() {
  const value = Number(paceValue.value)
  if (Number.isFinite(value) && value > 0 && value <= 120) emit('pace', props.route.mode, value)
  editingPace.value = false
}
</script>

<template>
  <article class="route-card surface" :class="{ selected, hovered }" @mouseenter="emit('preview', route.id)" @mouseleave="emit('preview', '')">
    <button type="button" class="route-card-select" :aria-label="`Select ${route.name}`" :aria-pressed="selected" @click="emit('select', route.id, true)" />
    <div class="route-card-header"><h2>{{ route.name }}</h2><IconButton class="save-bookmark" :class="{ saved }" :icon="saved ? 'ph:bookmark-simple-fill' : 'ph:bookmark-simple'" :label="saved ? 'Route saved' : 'Save route'" side="above" :aria-pressed="saved" @click="emit('save', route)" /></div>
    <div class="route-distance"><span>{{ distanceText(route.distanceMeters, units) }}</span><span class="unit distance-unit">{{ units }}</span></div>
    <div class="route-stats">
      <span class="stat"><Icon name="ph:wave-sine" size="16" /><span class="stat-value">{{ gainText(route.gainMeters, units) }}</span><span v-if="route.gainMeters !== null" class="unit">{{ units === 'mi' ? 'ft' : 'm' }}</span></span>
      <button type="button" class="stat time-button" aria-label="Edit pace" data-tooltip="Edit pace" @click="editPace"><Icon name="ph:timer" size="16" /><span class="stat-value">{{ minutesFor(route.distanceMeters, route.mode, pace) }}</span><span class="unit">min</span></button>
    </div>
    <form v-if="editingPace" class="pace-editor" @submit.prevent="commitPace">
      <label :for="`pace-${route.id}`">Minutes per mile</label><input :id="`pace-${route.id}`" v-model="paceValue" type="number" min="1" max="120" step="0.25" @keydown.esc="editingPace = false" /><button type="submit">Done</button>
    </form>
  </article>
</template>
