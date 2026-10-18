<script setup lang="ts">
import type { Coordinates, Mode, RouteCandidate, Units } from '../domain/planner'
import { distanceText, gainText } from '../domain/units'
const props = defineProps<{ route: RouteCandidate; units: Units; open: boolean; mobile: boolean; pace: Record<Mode, number> }>()
defineEmits<{ toggle: []; highlight: [points: Coordinates[]] }>()
const directions: Record<string, string> = { straight: 'ph:arrow-up', left: 'ph:arrow-bend-up-left', right: 'ph:arrow-bend-up-right', 'slight-left': 'ph:arrow-up-left', 'slight-right': 'ph:arrow-up-right', arrive: 'ph:flag-checkered' }
const profile = computed(() => {
  const values = props.route.elevationProfile
  if (values.length < 2) return ''
  const min = Math.min(...values), range = Math.max(5, Math.max(...values) - min)
  return values.map((v, i) => `${(i / (values.length - 1) * 288).toFixed(1)},${(52 - (v - min) / range * 40).toFixed(1)}`).join(' ')
})
</script>

<template>
  <aside class="route-legend" :class="{ open }" aria-label="Route directions">
    <button type="button" class="legend-chip surface pressable" :aria-expanded="open" aria-controls="route-directions" @click="$emit('toggle')"><Icon name="ph:list-numbers" size="20" /><span>{{ route.turns.length ? `${route.turns.length} turns` : 'Directions' }} · {{ gainText(route.gainMeters, units) }}<template v-if="route.gainMeters !== null"> {{ units === 'mi' ? 'ft' : 'm' }}</template></span><Icon :name="open ? (mobile ? 'ph:caret-down' : 'ph:caret-up') : (mobile ? 'ph:caret-up' : 'ph:caret-down')" size="20" /></button>
    <Transition name="legend"><div v-if="open" id="route-directions" class="legend-dropdown surface">
      <svg v-if="profile" class="elevation-profile" viewBox="0 0 288 60" role="img" aria-label="Recorded elevation profile"><polygon :points="`0,60 ${profile} 288,60`" fill="var(--hover)" /><polyline :points="profile" fill="none" stroke="var(--fg)" stroke-width="1.5" /></svg>
      <p v-else class="legend-unavailable">Elevation profile unavailable</p>
      <ol v-if="route.turns.length" class="turn-list"><li v-for="turn in route.turns" :key="turn.id" @mouseenter="$emit('highlight', turn.coordinates)" @mouseleave="$emit('highlight', [])"><Icon :name="directions[turn.instruction] ?? 'ph:arrow-up'" size="20" /><span>{{ turn.street || 'Path' }}</span><strong>{{ distanceText(turn.distanceMeters, units) }} <span class="unit distance-unit">{{ units }}</span></strong></li></ol>
      <p v-else class="legend-unavailable">Turn directions unavailable in this preview.</p>
    </div></Transition>
  </aside>
</template>
