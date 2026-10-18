<script setup lang="ts">
withDefaults(defineProps<{ busy?: boolean; disabled?: boolean; label?: string }>(), { busy: false, disabled: false, label: 'Roll' })
</script>

<template>
  <button type="button" class="roll-button pressable" :class="{ busy }" :aria-busy="busy" :aria-label="busy ? 'Generating routes' : label" :disabled="disabled || busy">
    <Icon v-if="busy" class="spinner" name="ph:spinner-gap" size="20" aria-hidden="true" />
    <span v-else class="roll-content"><Icon class="roll-dice" name="ph:dice-five" size="20" aria-hidden="true" /><span>{{ label }}</span></span>
  </button>
</template>
