<script setup lang="ts">
const { messages } = useNotify()
</script>
<template>
  <div class="toast-stack" role="status" aria-live="polite">
    <div v-for="message in messages" :key="message.id" class="toast" :class="message.type">
      <AppIcon :name="message.type === 'error' ? 'info' : 'check'" :size="18" /><span>{{
        message.message
      }}</span>
    </div>
  </div>
</template>
