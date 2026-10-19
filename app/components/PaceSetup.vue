<script setup lang="ts">
import type { Mode, Units } from '../domain/planner'
import { MODE_ICONS } from '../domain/planner'
import { PACE_LIMITS, paceFor, paceFromInput, paceSuffix, paceText } from '../domain/units'
const props = defineProps<{ open: boolean; units: Units; paces: Record<Mode, number> }>()
const emit = defineEmits<{ save: [paces: Record<Mode, number>] }>()
const rows: { mode: Mode; label: string }[] = [{ mode: 'bike', label: 'Biking' }, { mode: 'run', label: 'Running' }, { mode: 'walk', label: 'Walking' }]
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const drafts = reactive<Record<Mode, string>>({ bike: '', run: '', walk: '' })
const inputMin = computed(() => paceFor(PACE_LIMITS.minimum, props.units))
const inputMax = computed(() => paceFor(PACE_LIMITS.maximum, props.units))
const valid = computed(() => rows.every(({ mode }) => {
  const value = paceFromInput(Number(drafts[mode]), props.units)
  // v-model on a number input stores a number, and an empty box reads as 0, below the minimum.
  return Number.isFinite(value) && value >= PACE_LIMITS.minimum && value <= PACE_LIMITS.maximum
}))
// Opens with the current values, which start as the defaults on first run.
watch(() => props.open, open => {
  if (open) {
    for (const { mode } of rows) drafts[mode] = paceText(props.paces[mode], props.units)
    if (!dialog.value?.open) dialog.value?.showModal()
  } else if (dialog.value?.open) dialog.value.close()
})
function save() {
  if (!valid.value) return
  const paces = { ...props.paces }
  for (const { mode } of rows) paces[mode] = paceFromInput(Number(drafts[mode]), props.units)
  emit('save', paces)
}
</script>

<template>
  <!-- Escape does nothing here. The baseline is set by Continue, so the first run always records it. -->
  <dialog ref="dialog" class="pace-setup" aria-labelledby="pace-setup-title" aria-describedby="pace-setup-note" @cancel.prevent>
    <form class="pace-setup-body" @submit.prevent="save">
      <h2 id="pace-setup-title">Your usual pace</h2>
      <p id="pace-setup-note">Routelette estimates each route's time from this. You can change it from any route card.</p>
      <div class="pace-setup-rows">
        <label v-for="row in rows" :key="row.mode" class="pace-setup-row">
          <Icon :name="MODE_ICONS[row.mode]" size="20" /><span>{{ row.label }}</span>
          <input v-model="drafts[row.mode]" type="number" inputmode="decimal" step="any" :min="inputMin" :max="inputMax" :aria-label="`${row.label} pace`" />
          <span class="unit">{{ paceSuffix(units) }}</span>
        </label>
      </div>
      <button type="submit" class="pace-setup-submit" :disabled="!valid">Continue</button>
    </form>
  </dialog>
</template>
