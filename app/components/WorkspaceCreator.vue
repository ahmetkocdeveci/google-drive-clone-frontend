<script setup lang="ts">
import type { Workspace } from '../../shared/types'
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; created: [workspace: Workspace] }>()
const drive = useDrive()
const name = ref(''),
  description = ref(''),
  color = ref('#4285f4'),
  pending = ref(false),
  error = ref('')
const colors = ['#4285f4', '#34a853', '#a142f4', '#f9ab00', '#e8710a', '#d93025']
async function create() {
  if (!name.value.trim()) {
    error.value = 'Çalışma alanının adını yaz.'
    return
  }
  pending.value = true
  error.value = ''
  try {
    const workspace = await drive.api.createWorkspace({
      name: name.value.trim(),
      description: description.value.trim(),
      color: color.value,
    })
    await drive.refreshWorkspaces()
    name.value = ''
    description.value = ''
    emit('created', workspace)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Çalışma alanı oluşturulamadı.'
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <AppModal
    :open="open"
    title="Çalışma alanı oluştur"
    description="Dosyaların ve takımın için yeni bir alan. Bu alanın Owner'ı sen olacaksın."
    :busy="pending"
    @close="emit('close')"
    ><form @submit.prevent="create">
      <div class="form-field">
        <label for="new-workspace-name">Çalışma alanı adı</label
        ><input
          id="new-workspace-name"
          v-model="name"
          class="form-input"
          maxlength="60"
          required
          placeholder="Örn. Tasarım ekibi"
          autofocus
        />
      </div>
      <div class="form-field">
        <label for="new-workspace-description"
          >Açıklama <span class="muted">(isteğe bağlı)</span></label
        ><input
          id="new-workspace-description"
          v-model="description"
          class="form-input"
          maxlength="160"
          placeholder="Birlikte ne üzerinde çalışıyorsunuz?"
        />
      </div>
      <fieldset class="color-options">
        <legend>Alan rengi</legend>
        <label v-for="item in colors" :key="item" :style="{ '--swatch': item }"
          ><input
            v-model="color"
            type="radio"
            name="workspace-color"
            :value="item"
            :aria-label="item" /><span
            ><AppIcon v-if="color === item" name="check" :size="17" /></span
        ></label>
      </fieldset>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" :disabled="pending" @click="emit('close')">
          Vazgeç</button
        ><button class="btn btn-primary" type="submit" :disabled="pending">
          {{ pending ? 'Oluşturuluyor…' : 'Alanı oluştur' }}
        </button>
      </div>
    </form></AppModal
  >
</template>
