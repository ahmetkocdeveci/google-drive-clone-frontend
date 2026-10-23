<script setup lang="ts">
const props = withDefaults(defineProps<{ open: boolean; title: string; description?: string; busy?: boolean; wide?: boolean }>(), { description: '', busy: false, wide: false })
const emit = defineEmits<{ close: [] }>()
const element = ref<HTMLDialogElement>()
const titleId = useId()
function cancel() { if (!props.busy) emit('close') }
function backdrop(event: MouseEvent) {
  if (event.target !== element.value || !element.value) return
  const box = element.value.getBoundingClientRect()
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) cancel()
}
async function sync() { await nextTick(); if (props.open && !element.value?.open) element.value?.showModal(); else if (!props.open && element.value?.open) element.value.close() }
watch(() => props.open, sync)
onMounted(sync)
</script>
<template><dialog ref="element" class="app-modal" :class="{ wide }" :aria-labelledby="titleId" @cancel.prevent="cancel" @click="backdrop"><div class="modal-header"><div><h2 :id="titleId">{{ title }}</h2><p v-if="description">{{ description }}</p></div><button class="icon-btn" type="button" aria-label="Pencereyi kapat" :disabled="busy" @click="cancel"><AppIcon name="close" /></button></div><div class="modal-body"><slot /></div></dialog></template>
