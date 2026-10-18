<script setup lang="ts">
import type { Mode, Units } from '../domain/planner'
import { commitDistance, distanceLimits, fromDistance, toDistance } from '../domain/units'
const props = defineProps<{ meters: number; mode: Mode; units: Units }>()
const emit = defineEmits<{ change: [meters: number] }>()
const editing = ref(false), text = ref(''), draft = ref<number | null>(null)
const field = useTemplateRef<HTMLInputElement>('field')
const limits = computed(() => distanceLimits(props.mode, props.units))
const value = computed(() => draft.value ?? toDistance(props.meters, props.units))
const percentage = computed(() => Math.min(100, Math.max(0, (value.value - limits.value.minimum) / (limits.value.maximum - limits.value.minimum) * 100)))
async function edit() {
  if (editing.value) return
  text.value = value.value.toFixed(1)
  editing.value = true
  await nextTick()
  field.value?.focus()
  field.value?.select()
}
function commit() {
  if (!editing.value) return
  editing.value = false
  const meters = commitDistance(text.value, props.mode, props.units, props.meters)
  if (meters !== props.meters) emit('change', meters)
}
function cancel() { editing.value = false; field.value?.blur() }
function release(event: Event) {
  const next = Number((event.target as HTMLInputElement).value)
  draft.value = null
  const meters = fromDistance(next, props.units)
  if (Math.abs(meters - props.meters) > 0.01) emit('change', meters)
}
</script>

<template>
  <section class="control-section distance-section">
    <h2 class="section-label">Distance</h2>
    <div class="distance-block">
      <div class="distance-value-row">
        <span class="distance-sizer">
          <span class="distance-sizer-text" aria-hidden="true">{{ editing ? (text || '0') : value.toFixed(1) }}</span>
          <input ref="field" class="distance-value" :class="{ editing }" :value="editing ? text : value.toFixed(1)" aria-label="Distance" inputmode="decimal" :readonly="!editing" @focus="edit" @input="text = ($event.target as HTMLInputElement).value" @blur="commit" @keydown.enter="commit" @keydown.esc="cancel" />
        </span>
        <span class="unit distance-unit">{{ units }}</span>
      </div>
      <input class="distance-slider" type="range" aria-label="Distance slider" :min="limits.minimum" :max="limits.maximum" :step="limits.step" :value="Math.min(limits.maximum, Math.max(limits.minimum, value))" :style="{ '--range-fill': `${percentage}%` }" @input="draft = Number(($event.target as HTMLInputElement).value)" @change="release" />
      <div class="distance-range"><span>{{ Number(limits.minimum.toFixed(1)) }}</span><span>{{ Number(limits.maximum.toFixed(1)) }}</span></div>
    </div>
  </section>
</template>
