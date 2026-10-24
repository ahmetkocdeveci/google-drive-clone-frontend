<script setup lang="ts">
const drive = useDrive()
const pageKey = (route: { path: string }) =>
  `${drive.user.value?.id || 'anonymous'}:${route.path}:${drive.workspaceAccessRevision.value}`
function refreshWhenVisible() {
  if (document.visibilityState !== 'visible') return
  // Keep the current view on transient network failure; its own requests still show errors.
  void drive.refreshSession().catch(() => {})
}
onMounted(() => {
  window.addEventListener('focus', refreshWhenVisible)
  document.addEventListener('visibilitychange', refreshWhenVisible)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshWhenVisible)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
})
</script>

<template>
  <a class="skip-link" href="#main-content">İçeriğe geç</a>
  <NuxtLoadingIndicator color="#1a73e8" :height="3" />
  <NuxtLayout><NuxtPage :page-key="pageKey" /></NuxtLayout>
  <AppToasts />
</template>
