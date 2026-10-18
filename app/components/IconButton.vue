<script setup lang="ts">
import type { CSSProperties } from 'vue'
const props = withDefaults(defineProps<{ icon?: string; label: string; active?: boolean; disabled?: boolean; danger?: boolean; side?: 'above' | 'below' }>(), { active: false, disabled: false, danger: false, side: 'below' })
const id = useId()
const button = useTemplateRef<HTMLButtonElement>('button')
const tip = useTemplateRef<HTMLElement>('tip')
const visible = ref(false), position = ref<CSSProperties>({})
function hide() { visible.value = false }
async function show() {
  if (!button.value || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
  const rect = button.value.getBoundingClientRect()
  visible.value = true
  position.value = { left: `${rect.left + rect.width / 2}px`, top: `${rect.bottom + 4}px`, visibility: 'hidden' }
  await nextTick()
  if (!visible.value || !tip.value) return
  const { width, height } = tip.value.getBoundingClientRect()
  const above = props.side === 'above' || rect.bottom + height + 4 > window.innerHeight - 8
  position.value = {
    left: `${Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8))}px`,
    top: `${above ? Math.max(8, rect.top - height - 4) : rect.bottom + 4}px`,
  }
}
function focus(event: FocusEvent) { if ((event.target as HTMLElement).matches(':focus-visible')) void show() }
onMounted(() => { window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide) })
onBeforeUnmount(() => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide) })
</script>

<template>
  <button ref="button" type="button" class="icon-button pressable" :class="{ active, danger }" :aria-label="label" :aria-describedby="visible ? id : undefined" :disabled="disabled" @pointerenter="show" @pointerleave="hide" @focus="focus" @blur="hide" @keydown.esc="hide" @click="hide">
    <Icon v-if="icon" :name="icon" size="20" aria-hidden="true" /><slot v-else />
    <Teleport to="body"><span v-if="visible" :id="id" ref="tip" role="tooltip" class="icon-tooltip" :style="position">{{ label }}</span></Teleport>
  </button>
</template>
