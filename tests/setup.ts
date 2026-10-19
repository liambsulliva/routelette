import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'

// Nuxt auto-imports these in app components. Tests mount components without Nuxt, so they are provided as globals.
Object.assign(globalThis, { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef, watch })

// jsdom implements <dialog> but not its modal methods. A minimal version keeps the open state the components read.
const dialogPrototype = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void }
if (!dialogPrototype.showModal) {
  dialogPrototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
  dialogPrototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open') }
}
Object.defineProperty(HTMLDialogElement.prototype, 'open', {
  configurable: true,
  get(this: HTMLDialogElement) { return this.hasAttribute('open') },
  set(this: HTMLDialogElement, value: boolean) { if (value) this.setAttribute('open', ''); else this.removeAttribute('open') },
})
