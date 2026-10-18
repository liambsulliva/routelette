<script setup lang="ts">
import { createMapAdapter } from '../map/adapter'
import type { MapAdapter, MapScene } from '../map/adapter'
import type { Coordinates } from '../domain/planner'
const props = defineProps<{ scene: MapScene; dark: boolean; reducedMotion: boolean; revision: number; presentation: string; mobile: boolean; panelHeight: number; cards: boolean; highlighted: Coordinates[] }>()
const emit = defineEmits<{ click: [point: Coordinates, routeId?: string]; hover: [id: string]; select: [id: string]; joint: [index: number, point: Coordinates]; longpress: [point: Coordinates] }>()
const container = useTemplateRef<HTMLElement>('container')
const loading = ref(true), failed = ref(false)
let adapter: MapAdapter | null = null
function render(reveal = true) {
  adapter?.render(props.scene, { animate: !props.reducedMotion, fit: reveal && props.presentation === 'generate', reveal: reveal && ['generate', 'restore', 'reverse'].includes(props.presentation), deferAlternates: ['generate', 'restore'].includes(props.presentation), mobile: props.mobile, panelHeight: props.panelHeight, cards: props.cards })
}
onMounted(() => {
  if (!container.value) return
  try {
    adapter = createMapAdapter(container.value, { click: (point, id) => emit('click', point, id), hover: id => emit('hover', id), select: id => emit('select', id), jointDrop: (index, point) => emit('joint', index, point), longPress: point => emit('longpress', point) }, props.dark, () => { loading.value = false; failed.value = false }, () => { failed.value = true; loading.value = false })
    render()
  } catch { loading.value = false; failed.value = true }
})
watch(() => props.revision, () => render())
watch(() => props.dark, dark => adapter?.theme(dark))
watch(() => props.highlighted, points => adapter?.highlight(points))
watch(() => props.scene.hoveredId, id => adapter?.emphasize(id ?? ''))
watch(() => props.scene.start?.id, () => { if (props.scene.start && !props.scene.routes.length) adapter?.fly(props.scene.start.coordinates, !props.reducedMotion) })
watch(() => props.reducedMotion, () => render(false))
onBeforeUnmount(() => adapter?.destroy())
</script>

<template>
  <div ref="container" class="map-canvas" aria-label="Route map" />
  <div v-if="loading" class="map-status" role="status"><Icon name="ph:spinner-gap" class="spinner" />Loading map</div>
  <div v-if="failed" class="map-status" role="status"><Icon name="ph:warning-circle" />Map unavailable. Check your connection.</div>
</template>
