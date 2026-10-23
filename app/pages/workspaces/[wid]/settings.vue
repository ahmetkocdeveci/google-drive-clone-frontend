<script setup lang="ts">
definePageMeta({ layout: 'workspace', middleware: ['workspace'] })

const drive = useDrive()
const route = useRoute()
const { notify } = useNotify()
const workspace = computed(() => drive.currentWorkspace.value)
const workspaceId = computed(() => String(route.params.wid || ''))
const canManage = computed(() => workspace.value?.id === workspaceId.value && workspace.value.capabilities.includes('workspace:update'))
const name = ref('')
const description = ref('')
const color = ref('#4285f4')
const pending = ref(false)
const error = ref('')
const deleteOpen = ref(false)
const deleteName = ref('')
const deleteError = ref('')
const deleting = ref(false)
const colors = [ { value: '#4285f4', name: 'Mavi' }, { value: '#8b5cf6', name: 'Mor' }, { value: '#16a085', name: 'Yeşil' }, { value: '#e99c23', name: 'Turuncu' }, { value: '#dc5d80', name: 'Pembe' }, { value: '#607d8b', name: 'Gri' } ]
const changed = computed(() => !!workspace.value && (name.value.trim() !== workspace.value.name || description.value.trim() !== workspace.value.description || color.value !== workspace.value.color))
const validDelete = computed(() => !!workspace.value && deleteName.value === workspace.value.name)
let disposed = false
let controller: AbortController | null = null

function reset() {
  if (!workspace.value || workspace.value.id !== workspaceId.value) return
  name.value = workspace.value.name
  description.value = workspace.value.description
  color.value = workspace.value.color
  error.value = ''
}

watch(() => workspace.value?.id, reset, { immediate: true })
watch(workspaceId, () => { controller?.abort(); deleteOpen.value = false; deleteName.value = ''; error.value = ''; reset() })
onBeforeUnmount(() => { disposed = true; controller?.abort() })

async function save() {
  if (pending.value || deleting.value || !changed.value) return
  error.value = ''
  const trimmedName = name.value.trim()
  if (!trimmedName || trimmedName.length > 100) { error.value = 'Çalışma alanı adı 1–100 karakter arasında olmalı.'; return }
  const wid = workspaceId.value
  pending.value = true
  controller = new AbortController()
  try {
    const updated = await drive.api.updateWorkspace(wid, { name: trimmedName, description: description.value.trim(), color: color.value }, { signal: controller.signal })
    if (disposed || wid !== workspaceId.value) return
    drive.currentWorkspace.value = updated
    const index = drive.workspaces.value.findIndex(item => item.id === wid)
    if (index >= 0) drive.workspaces.value[index] = updated
    reset()
    notify('Çalışma alanı ayarları kaydedildi.', 'success')
  } catch (cause) { if (!disposed && wid === workspaceId.value && (cause as { name?: string })?.name !== 'AbortError') error.value = cause instanceof Error ? cause.message : 'Ayarlar kaydedilemedi. Lütfen yeniden dene.' }
  finally { if (!disposed) pending.value = false }
}

function openDelete() { deleteName.value = ''; deleteError.value = ''; deleteOpen.value = true }
async function removeWorkspace() {
  if (!validDelete.value || deleting.value || pending.value) return
  const wid = workspaceId.value
  deleting.value = true
  deleteError.value = ''
  controller = new AbortController()
  try {
    await drive.api.deleteWorkspace(wid, { signal: controller.signal })
    if (disposed || wid !== workspaceId.value) return
    drive.currentWorkspace.value = null
    drive.workspaces.value = drive.workspaces.value.filter(item => item.id !== wid)
    deleteOpen.value = false
    notify('Çalışma alanı silindi.', 'success')
    await navigateTo('/workspaces')
  } catch (cause) { if (!disposed && wid === workspaceId.value && (cause as { name?: string })?.name !== 'AbortError') deleteError.value = cause instanceof Error ? cause.message : 'Çalışma alanı silinemedi. Lütfen yeniden dene.' }
  finally { if (!disposed) deleting.value = false }
}
</script>

<template>
  <div class="settings-page"><header class="page-heading"><div><p class="eyebrow">{{ workspace?.name }}</p><h1 class="page-title">Çalışma alanı ayarları</h1><p class="page-subtitle">Ekibinin ortak alanını kendinize göre düzenleyin.</p></div></header>
    <div v-if="!canManage" class="empty-state"><AppIcon name="shield" :size="36" /><h2>Bu ayarları yalnızca Owner yönetebilir</h2><p>Çalışma alanı ayarlarını değiştirme yetkin bulunmuyor.</p><NuxtLink :to="`/workspaces/${encodeURIComponent(workspaceId)}/files`" class="btn btn-primary">Dosyalara dön</NuxtLink></div>
    <template v-else><section class="panel settings-panel" aria-labelledby="general-heading"><div class="section-heading"><h2 id="general-heading">Genel bilgiler</h2><p class="muted">Bu bilgiler çalışma alanındaki tüm üyeler tarafından görülebilir.</p></div><form :aria-busy="pending" @submit.prevent="save"><div class="workspace-identity"><span class="workspace-avatar" :style="{ backgroundColor: color + '1a', color }" aria-hidden="true">{{ (name || 'Ç').slice(0, 1).toLocaleUpperCase('tr-TR') }}</span><div><strong>{{ name || 'Çalışma alanı' }}</strong><span>Çalışma alanı görünümü</span></div></div><div class="form-field"><label for="workspace-name">Çalışma alanı adı</label><input id="workspace-name" v-model="name" class="form-input" type="text" required maxlength="100" :disabled="pending || deleting" /></div><div class="form-field"><label for="workspace-description">Açıklama <span class="optional">İsteğe bağlı</span></label><textarea id="workspace-description" v-model="description" class="form-input description-input" rows="4" maxlength="500" placeholder="Bu alanda neler üzerinde çalışıyorsunuz?" :disabled="pending || deleting" /><span class="character-count">{{ description.length }}/500</span></div><fieldset class="color-field"><legend>Çalışma alanı rengi</legend><div class="color-options"><label v-for="option in colors" :key="option.value" class="color-option" :class="{ selected: color === option.value }" :style="{ '--swatch': option.value }"><input v-model="color" type="radio" name="workspace-color" :value="option.value" :aria-label="option.name" :disabled="pending || deleting" /><span :title="option.name"><AppIcon v-if="color === option.value" name="check" :size="18" /></span></label></div><p class="muted">Listelerde çalışma alanını kolayca ayırt etmeni sağlar.</p></fieldset><p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="settings-actions"><p class="muted">Değişiklikler tüm ekip için geçerlidir.</p><div><button class="btn btn-secondary" type="button" :disabled="pending || deleting || !changed" @click="reset">Vazgeç</button><button class="btn btn-primary" type="submit" :disabled="pending || deleting || !changed">{{ pending ? 'Kaydediliyor…' : 'Değişiklikleri kaydet' }}</button></div></div></form></section>
      <section v-if="workspace?.capabilities.includes('workspace:delete')" class="panel danger-panel" aria-labelledby="delete-heading"><div class="danger-icon"><AppIcon name="trash" :size="22" /></div><div class="danger-description"><h2 id="delete-heading">Çalışma alanını sil</h2><p>Bu çalışma alanı, dosyaları ve klasörleri tüm üyeler için silinir. Bu işlem geri alınamaz.</p></div><button type="button" class="btn btn-danger" :disabled="pending || deleting" @click="openDelete">Çalışma alanını sil</button></section>
    </template>
    <AppModal :open="deleteOpen" title="Çalışma alanını silmek istediğinden emin misin?" :busy="deleting" @close="deleteOpen = false"><form @submit.prevent="removeWorkspace"><p class="delete-warning"><strong>{{ workspace?.name }}</strong> içindeki dosyalar, klasörler ve ekip erişimleri kaldırılacak. Tüm ekip bu çalışma alanına erişimini kaybedecek.</p><div class="form-field"><label for="delete-workspace-name">Onaylamak için <strong>{{ workspace?.name }}</strong> yaz.</label><input id="delete-workspace-name" v-model="deleteName" class="form-input" type="text" autocomplete="off" :disabled="deleting" required /></div><p v-if="deleteError" class="form-error" role="alert">{{ deleteError }}</p><div class="form-actions"><button type="button" class="btn btn-secondary" :disabled="deleting" @click="deleteOpen = false">Vazgeç</button><button type="submit" class="btn btn-danger" :disabled="deleting || !validDelete">{{ deleting ? 'Siliniyor…' : 'Çalışma alanını kalıcı olarak sil' }}</button></div></form></AppModal>
  </div>
</template>

<style scoped>
.settings-page { max-width: 900px; }
.eyebrow { margin: 0 0 8px; color: var(--accent); font-size: 12px; font-weight: 600; }
.settings-panel { padding: 0; overflow: hidden; }
.section-heading { padding: 26px 30px; border-bottom: 1px solid var(--line); }
.section-heading h2 { margin: 0; font-size: 17px; font-weight: 600; }
.section-heading p { margin: 9px 0 0; font-size: 12px; line-height: 1.6; }
.settings-panel form { padding: 28px 30px 0; }
.workspace-identity { display: flex; align-items: center; gap: 16px; margin-bottom: 30px; }
.workspace-avatar { width: 64px; height: 64px; border-radius: 19px; display: grid; place-items: center; font-size: 29px; font-weight: 600; flex-shrink: 0; }
.workspace-identity strong { display: block; font-size: 17px; font-weight: 500; overflow-wrap: anywhere; }
.workspace-identity span:not(.workspace-avatar) { display: block; color: var(--muted); font-size: 12px; margin-top: 7px; }
.settings-panel .form-field { max-width: 580px; margin-bottom: 24px; }
.optional { margin-left: 6px; color: var(--muted); font-size: 11px; font-weight: 400; }
.description-input { resize: vertical; min-height: 110px; line-height: 1.7; }
.character-count { display: block; font-size: 11px; color: var(--muted); text-align: right; margin-top: 7px; }
.color-field { border: 0; margin: 0 0 32px; padding: 0; }
.color-field legend { font-size: 13px; font-weight: 500; margin-bottom: 14px; }
.color-field > p { font-size: 12px; line-height: 1.6; margin: 12px 0 0; }
.color-options { display: flex; gap: 12px; }
.color-option { position: relative; width: 36px; height: 36px; cursor: pointer; display: grid; place-items: center; }
.color-option input { position: absolute; width: 100%; height: 100%; opacity: 0; margin: 0; cursor: pointer; }
.color-option > span { width: 30px; height: 30px; background: var(--swatch); color: white; border-radius: 50%; display: grid; place-items: center; pointer-events: none; }
.color-option.selected::before { content: ''; position: absolute; inset: 0; border: 2px solid var(--swatch); border-radius: 50%; }
.color-option:focus-within { outline: 2px solid var(--accent); border-radius: 50%; outline-offset: 3px; }
.settings-actions { border-top: 1px solid var(--line); margin: 0 -30px; padding: 20px 30px; display: flex; align-items: center; gap: 20px; justify-content: space-between; }
.settings-actions > p { margin: 0; font-size: 11px; }
.settings-actions > div { display: flex; align-items: center; gap: 10px; }
.danger-panel { margin-top: 26px; border-color: #f1d1ce; display: flex; align-items: center; gap: 16px; padding: 26px 30px; }
.danger-icon { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 13px; color: #b3261e; background: #fceae8; flex-shrink: 0; }
.danger-description { flex: 1; }
.danger-description h2 { margin: 0 0 7px; font-size: 15px; font-weight: 600; }
.danger-description p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; max-width: 390px; }
.danger-panel > button { flex-shrink: 0; }
.delete-warning { padding: 14px 16px; background: #fff3f1; border: 1px solid #f1d1ce; color: #9d342d; font-size: 13px; line-height: 1.8; border-radius: 10px; margin: 0 0 24px; }
@media (max-width: 800px) { .settings-actions { align-items: flex-start; flex-direction: column; } .settings-actions > div { width: 100%; justify-content: flex-end; } .danger-panel { flex-wrap: wrap; } .danger-panel > button { margin-left: 62px; } }
@media (max-width: 520px) { .section-heading { padding: 22px 20px; } .settings-panel form { padding: 22px 20px 0; } .settings-actions { margin-left: -20px; margin-right: -20px; padding: 20px; } .settings-actions > div { flex-direction: column-reverse; align-items: stretch; } .settings-actions .btn { justify-content: center; } .danger-panel { padding: 22px 20px; align-items: flex-start; } .danger-icon { display: none; } .danger-panel > button { margin-left: 0; } }
</style>
