<script setup lang="ts">
const drive = useDrive()
</script>
<template>
  <div class="auth-shell">
    <aside class="auth-story">
      <NuxtLink to="/workspaces" class="brand"
        ><img src="/favicon.svg" alt="" /><span>Ortak <strong>Drive</strong></span></NuxtLink
      >
      <h2>Dosyaların.<br />Ekibin.<br />Ortak alanın.</h2>
      <p>Projelerine bir yer aç. Dosyalarını düzenle ve doğru kişilerle birlikte çalış.</p>
      <div class="auth-feature">
        <AppIcon name="folder" :size="18" />Her proje için ayrı bir çalışma alanı
      </div>
      <div class="auth-feature">
        <AppIcon name="users" :size="18" />Ekibine uygun roller ve erişimler
      </div>
    </aside>
    <main id="main-content" class="auth-content">
      <div v-if="drive.mode.value === 'demo'" class="auth-mode">
        <span class="mode-pill">Demo · örnek veriler</span>
      </div>
      <slot />
      <p class="auth-footer">Ortak Drive · Çalışma alanların bir arada.</p>
    </main>
  </div>
</template>
