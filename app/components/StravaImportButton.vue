<script setup lang="ts">
withDefaults(defineProps<{ dark: boolean; state?: 'idle' | 'loading' | 'done' }>(), { state: 'idle' })
</script>

<template>
  <button type="button" class="strava-button pressable" :aria-busy="state === 'loading'" :aria-label="state === 'loading' ? 'Importing from Strava' : state === 'done' ? 'Import complete' : 'Import from Strava'">
    <Icon v-if="state === 'loading'" name="ph:spinner-gap" class="spinner" size="24" />
    <Icon v-else-if="state === 'done'" name="ph:check" size="24" />
    <span v-else class="strava-lockup"><span class="strava-label-wrap"><span class="strava-label">IMPORT FROM</span></span><img :src="dark ? '/brand/strava-wordmark-dark.svg' : '/brand/strava-wordmark-white.svg'" width="87.16" height="16.92" alt="" /></span>
  </button>
</template>
