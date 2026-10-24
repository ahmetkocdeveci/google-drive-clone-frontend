<script setup lang="ts">
import type { Role } from '../../shared/types'
defineProps<{ role: Role }>()
</script>
<template>
  <span class="role-badge" :class="role"
    ><AppIcon
      :name="role === 'owner' ? 'shield' : role === 'editor' ? 'edit' : 'eye'"
      :size="12"
    />{{ role === 'owner' ? 'Owner' : role === 'editor' ? 'Editor' : 'Viewer' }}</span
  >
</template>
