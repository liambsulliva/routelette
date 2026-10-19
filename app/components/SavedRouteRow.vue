<script setup lang="ts">
import type { Mode, RouteCandidate, Units } from '../domain/planner'
import { MODE_ICONS } from '../domain/planner'
import { distanceText, gainText, minutesFor } from '../domain/units'
const props = defineProps<{ route: RouteCandidate; shown: RouteCandidate; selected: boolean; renaming: boolean; reversing: boolean; units: Units; pace: Record<Mode, number> }>()
const emit = defineEmits<{ select: []; rename: []; commitRename: [name: string]; cancelRename: []; reverse: []; share: []; remove: [] }>()
// The box is open from the moment `renaming` turns on until Enter, blur or Escape closes it. Only the first of those counts.
const open = ref(false)
const draft = ref('')
watch(() => props.renaming, value => { open.value = value; if (value) draft.value = props.route.name }, { immediate: true })
/** Focuses the rename box as it appears, selecting the name so typing replaces it. */
const vFocus = { mounted: (element: HTMLInputElement) => { element.focus(); element.select() } }
function commit() {
  if (!open.value) return
  open.value = false
  emit('commitRename', draft.value)
}
function cancel() {
  if (!open.value) return
  open.value = false
  emit('cancelRename')
}
</script>

<template>
  <article class="saved-route" :class="{ selected }">
    <button type="button" class="saved-select-hit" :aria-label="`Select ${route.name}`" :aria-pressed="selected" @click="emit('select')"></button>
    <div class="saved-select">
      <RouteThumbnail :coordinates="shown.coordinates" />
      <span class="saved-details">
        <input v-if="renaming" v-model="draft" v-focus class="rename-input" aria-label="Route name" maxlength="120" @keydown.enter.prevent="commit" @keydown.esc="cancel" @blur="commit" />
        <span v-else class="saved-name">{{ route.name }}</span>
        <span class="saved-specs">
          <Icon :name="MODE_ICONS[shown.mode]" size="16" />
          <span>{{ distanceText(shown.distanceMeters, units) }} <span class="unit distance-unit">{{ units }}</span></span>
          <span>{{ gainText(shown.gainMeters, units) }} <span class="unit">{{ units === 'mi' ? 'ft' : 'm' }}</span></span>
          <span>{{ minutesFor(shown.distanceMeters, shown.mode, pace) }} <span class="unit">min</span></span>
        </span>
      </span>
    </div>
    <div v-if="selected" class="saved-row-actions">
      <IconButton icon="ph:pencil-simple" label="Rename route" @click="emit('rename')" />
      <IconButton icon="ph:arrows-counter-clockwise" label="Reverse route" :disabled="reversing" @click="emit('reverse')" />
      <IconButton icon="ph:export" label="Share route" @click="emit('share')" />
      <IconButton icon="ph:trash" label="Delete route" danger @click="emit('remove')" />
    </div>
  </article>
</template>
