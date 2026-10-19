<script setup lang="ts">
const props = defineProps<{ open: boolean; title: string; message: string; confirmLabel: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
watch(() => props.open, open => {
  if (open && !dialog.value?.open) dialog.value?.showModal()
  if (!open && dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <!-- Escape and the Cancel button both close without acting. Backdrop clicks do nothing, so a destructive choice is always explicit. -->
  <dialog ref="dialog" class="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-message" @close="emit('cancel')">
    <div class="confirm-body">
      <h2 id="confirm-title">{{ title }}</h2>
      <p id="confirm-message">{{ message }}</p>
      <div class="confirm-actions">
        <button type="button" class="confirm-cancel" autofocus @click="emit('cancel')">Cancel</button>
        <button type="button" class="confirm-delete" @click="emit('confirm')">{{ confirmLabel }}</button>
      </div>
    </div>
  </dialog>
</template>
