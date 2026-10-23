<script setup lang="ts">
const drive = useDrive()
const user = computed(() => drive.user.value)
const { notify } = useNotify()
async function logout() { try { await drive.signOut() } catch (error) { notify(error instanceof Error ? error.message : 'Çıkış yapılamadı.', 'error') } }
</script>
<template><div><header class="default-header"><NuxtLink to="/workspaces" class="brand"><img src="/favicon.svg" alt="" /><span>Ortak <strong>Drive</strong></span></NuxtLink><div class="default-account"><span v-if="drive.mode.value === 'demo'" class="mode-pill">Demo modu</span><NuxtLink to="/account" class="name" aria-label="Hesap güvenliği">{{ user?.name }}</NuxtLink><span class="avatar">{{ user?.name.slice(0, 2).toLocaleUpperCase('tr-TR') }}</span><button class="icon-btn" aria-label="Çıkış yap" @click="logout"><AppIcon name="logout" /></button></div></header><main id="main-content" class="default-main"><slot /></main></div></template>
