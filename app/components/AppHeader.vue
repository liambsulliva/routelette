<script setup lang="ts">
import type { Units } from '../domain/planner'
defineProps<{ theme: 'light' | 'dark' | 'system'; dark: boolean; units: Units; reducedMotion: boolean }>()
defineEmits<{ theme: []; units: []; motion: [] }>()
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <span class="brand-mark"><img :src="dark ? '/brand/routelette-mark-dark.svg' : '/brand/routelette-mark.svg'" width="32" height="32" alt="" /></span>
      <span class="wordmark">Routelette</span>
    </div>
    <div class="header-controls">
      <IconButton :icon="theme === 'system' ? 'ph:circle-half' : theme === 'dark' ? 'ph:moon' : 'ph:sun'" :label="`Theme: ${theme}. Switch to ${theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'}`" @click="$emit('theme')" />
      <IconButton class="unit-control" :label="units === 'mi' ? 'Switch to kilometers' : 'Switch to miles'" @click="$emit('units')">{{ units }}</IconButton>
      <IconButton icon="ph:pause-circle" :label="reducedMotion ? 'Resume animations' : 'Pause animations'" :active="reducedMotion" :aria-pressed="reducedMotion" @click="$emit('motion')" />
    </div>
  </header>
</template>
