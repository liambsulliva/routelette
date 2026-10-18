<script setup lang="ts">
withDefaults(defineProps<{ busy?: boolean; disabled?: boolean; label?: string }>(), { busy: false, disabled: false, label: 'Roll' })
</script>

<template>
  <button type="button" class="roll-button pressable" :aria-busy="busy" :disabled="disabled">
    <span class="roll-content"><Icon class="roll-dice" name="ph:dice-five" size="20" aria-hidden="true" /><span>{{ label }}</span></span>
    <Icon v-if="busy" class="roll-spinner spinner" name="ph:spinner-gap" size="18" aria-label="Generating routes" />
  </button>
</template>
