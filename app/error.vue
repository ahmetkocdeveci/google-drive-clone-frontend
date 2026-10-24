<script setup lang="ts">
defineProps<{ error: { statusCode?: number; message?: string } }>()
</script>
<template>
  <div class="error-page">
    <AppIcon name="shield" :size="42" />
    <p class="eyebrow">ORTAK DRIVE</p>
    <h1>
      {{
        error.statusCode === 404 || error.statusCode === 403
          ? 'Bu alanı açamadık.'
          : 'Bir sorun oluştu.'
      }}
    </h1>
    <p>{{ error.message || 'Lütfen yeniden dene.' }}</p>
    <button class="btn btn-primary" @click="clearError({ redirect: '/workspaces' })">
      Çalışma alanlarına dön
    </button>
  </div>
</template>
