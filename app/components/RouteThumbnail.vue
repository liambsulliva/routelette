<script setup lang="ts">
import type { Coordinates } from '../domain/planner'
import { routeThumbnail } from '../domain/units'
const props = defineProps<{ coordinates: Coordinates[] }>()
const points = computed(() => routeThumbnail(props.coordinates))
</script>

<template>
  <svg class="route-thumbnail" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><polyline :points="points" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" /></svg>
</template>
