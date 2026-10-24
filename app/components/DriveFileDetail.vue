<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { DriveNode } from '../../shared/types'

const props = defineProps<{
  node: DriveNode | null
  previewUrl: string | null
  loading: boolean
  error: string
  canWrite: boolean
  locationPath: Array<{ id: string | null; name: string }>
  locationLoading: boolean
  locationError: string
}>()
const emit = defineEmits<{
  close: []
  'open-location': [folderId: string | null]
  download: [node: DriveNode]
  rename: [node: DriveNode]
  delete: [nodes: DriveNode[]]
}>()
const panel = ref<HTMLElement | null>(null)
const imageFailed = ref(false)
let previousFocus: HTMLElement | null = null
let previousOverflow = ''

const safeUrl = computed(() => {
  if (!props.previewUrl) return null
  try {
    const url = new URL(
      props.previewUrl,
      typeof window === 'undefined' ? 'https://localhost' : window.location.href,
    )
    return ['blob:', 'https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
})
const isImage = computed(
  () =>
    !!props.node &&
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(props.node.mimeType || ''),
)
const isPdf = computed(() => props.node?.mimeType === 'application/pdf')
const typeLabel = computed(() => {
  if (props.node?.kind === 'folder') return 'Klasör'
  if (isImage.value) return 'Görsel'
  if (isPdf.value) return 'PDF belgesi'
  if (/spreadsheet|excel|csv/.test(props.node?.mimeType || '')) return 'E-tablo'
  if (/presentation|powerpoint/.test(props.node?.mimeType || '')) return 'Sunum'
  return props.node?.mimeType || 'Dosya'
})
const icon = computed(() =>
  props.node?.kind === 'folder' ? 'folder' : isImage.value ? 'image' : 'file',
)
const size = computed(() => {
  const value = props.node?.size
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024)
    return `${(value / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`
  return `${(value / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
})
const updatedAt = computed(() => {
  const date = new Date(props.node?.updatedAt || '')
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
})

function close() {
  emit('close')
}

function handleKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const elements = Array.from(
    panel.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], iframe, [tabindex="0"]',
    ) || [],
  )
  if (!elements.length) {
    event.preventDefault()
    panel.value?.focus()
    return
  }
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === panel.value)
  ) {
    event.preventDefault()
    last?.focus()
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

watch(
  () => props.node?.id,
  async (id, oldId) => {
    imageFailed.value = false
    if (typeof document === 'undefined') return
    if (id && !oldId) {
      previousFocus = document.activeElement as HTMLElement
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    if (id) {
      await nextTick()
      panel.value?.querySelector<HTMLButtonElement>('.close-button')?.focus()
    } else if (oldId) {
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
      previousFocus = null
    }
  },
  { immediate: true },
)

watch(
  () => props.previewUrl,
  () => {
    imageFailed.value = false
  },
)
onBeforeUnmount(() => {
  if (typeof document !== 'undefined' && props.node) {
    document.body.style.overflow = previousOverflow
    if (previousFocus?.isConnected) previousFocus.focus()
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="node" class="detail-backdrop" @click.self="close" @keydown="handleKey">
      <section
        ref="panel"
        class="detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-detail-title"
        tabindex="-1"
      >
        <header class="detail-header">
          <span class="header-file-icon"><AppIcon :name="icon" :size="24" /></span>
          <div>
            <h2 id="file-detail-title" :title="node.name">{{ node.name }}</h2>
            <p>
              {{ typeLabel }}<span v-if="node.kind === 'file'"> · {{ size }}</span>
            </p>
          </div>
          <button
            class="detail-icon-button close-button"
            type="button"
            aria-label="Önizlemeyi kapat"
            @click="close"
          >
            <AppIcon name="close" :size="22" />
          </button>
        </header>

        <div class="detail-content">
          <div class="preview-area" :aria-busy="loading">
            <div v-if="loading" class="preview-placeholder" role="status">
              <span class="spinner" /><strong>Önizleme hazırlanıyor</strong>
              <p>Dosyan birazdan burada görünecek.</p>
            </div>
            <div v-else-if="error" class="preview-placeholder error-preview" role="alert">
              <span class="placeholder-icon"><AppIcon name="info" :size="33" /></span
              ><strong>Önizleme açılamadı</strong>
              <p>{{ error }}</p>
              <button class="download-button" type="button" @click="emit('download', node)">
                <AppIcon name="download" :size="18" />Dosyayı indir
              </button>
            </div>
            <img
              v-else-if="isImage && safeUrl && !imageFailed"
              :src="safeUrl"
              :alt="node.name"
              class="image-preview"
              @error="imageFailed = true"
            />
            <DrivePdfPreview
              v-else-if="isPdf && safeUrl"
              :key="node.id"
              :src="safeUrl"
              :name="node.name"
              @download="emit('download', node)"
            />
            <div v-else class="preview-placeholder">
              <span class="placeholder-icon"><AppIcon :name="icon" :size="45" /></span
              ><strong>{{
                node.kind === 'folder'
                  ? 'Klasör ayrıntıları'
                  : imageFailed
                    ? 'Bu görsel gösterilemiyor'
                    : 'Bu dosya için önizleme yok'
              }}</strong>
              <p>
                {{
                  node.kind === 'folder'
                    ? 'Klasörün içindekileri ZIP dosyası olarak indirebilirsin.'
                    : 'Dosyayı indirip cihazındaki uygun uygulamayla açabilirsin.'
                }}
              </p>
              <button class="download-button" type="button" @click="emit('download', node)">
                <AppIcon name="download" :size="18" />{{
                  node.kind === 'folder' ? 'ZIP olarak indir' : 'Dosyayı indir'
                }}
              </button>
            </div>
          </div>

          <aside class="details-sidebar" aria-label="Dosya bilgileri">
            <h3>Ayrıntılar</h3>
            <div class="details-file-symbol"><AppIcon :name="icon" :size="42" /></div>
            <div class="file-location">
              <h4>Bulunduğu klasör</h4>
              <p v-if="locationLoading" role="status">Konum yükleniyor…</p>
              <p v-else-if="locationError" role="alert">{{ locationError }}</p>
              <template v-else-if="locationPath.length"
                ><p>{{ locationPath.map((folder) => folder.name).join(' / ') }}</p>
                <button
                  type="button"
                  class="quiet-button"
                  @click="emit('open-location', locationPath[locationPath.length - 1]!.id)"
                >
                  <AppIcon name="folder" :size="16" />Klasöre git
                </button></template
              >
            </div>
            <dl>
              <div>
                <dt>Ad</dt>
                <dd class="full-name">{{ node.name }}</dd>
              </div>
              <div>
                <dt>Tür</dt>
                <dd>{{ typeLabel }}</dd>
              </div>
              <div v-if="node.kind === 'file'">
                <dt>Boyut</dt>
                <dd>{{ size }}</dd>
              </div>
              <div>
                <dt>Oluşturan</dt>
                <dd>
                  <span class="detail-avatar">{{
                    (node.createdBy?.name || '?').slice(0, 1).toLocaleUpperCase('tr-TR')
                  }}</span
                  >{{ node.createdBy?.name || 'Bilinmiyor' }}
                </dd>
              </div>
              <div>
                <dt>Son değiştirilme</dt>
                <dd>{{ updatedAt }}</dd>
              </div>
            </dl>
            <div class="access-note">
              <AppIcon :name="canWrite ? 'shield' : 'eye'" :size="17" />
              <p>
                {{
                  canWrite
                    ? 'Bu çalışma alanındaki içerikleri düzenleyebilirsin.'
                    : 'Bu çalışma alanındaki içerikleri yalnızca görüntüleyebilirsin.'
                }}
              </p>
            </div>
          </aside>
        </div>

        <footer class="detail-footer">
          <div class="write-actions">
            <template v-if="canWrite"
              ><button class="quiet-button" type="button" @click="emit('rename', node)">
                <AppIcon name="edit" :size="18" /><span>Yeniden adlandır</span></button
              ><button class="quiet-button danger" type="button" @click="emit('delete', [node])">
                <AppIcon name="trash" :size="18" /><span>Sil</span>
              </button></template
            >
          </div>
          <button
            class="download-button"
            type="button"
            :disabled="loading"
            @click="emit('download', node)"
          >
            <AppIcon name="download" :size="18" />{{
              node.kind === 'folder' ? 'ZIP olarak indir' : 'İndir'
            }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.file-location {
  margin-bottom: 22px;
  overflow-wrap: anywhere;
}
.file-location h4 {
  font-size: 11px;
  font-weight: 500;
  margin: 0 0 8px;
}
.file-location p {
  font-size: 12px;
  line-height: 1.7;
  margin: 0 0 8px;
}
.detail-backdrop {
  position: fixed;
  inset: 0;
  background: #17233770;
  z-index: 180;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px;
  backdrop-filter: blur(3px);
  font:
    14px Roboto,
    Arial,
    sans-serif;
  color: #1f1f1f;
}
.detail-dialog {
  width: min(1080px, 100%);
  max-height: calc(100dvh - 60px);
  background: #fff;
  box-shadow: 0 20px 80px #101c3a40;
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  outline: 0;
}
.detail-header {
  display: flex;
  gap: 13px;
  align-items: center;
  padding: 20px 23px;
  border-bottom: 1px solid #e7ebf0;
  min-width: 0;
}
.header-file-icon {
  width: 40px;
  height: 43px;
  display: grid;
  place-items: center;
  background: #edf3fd;
  border-radius: 9px;
  color: #0b57d0;
  flex-shrink: 0;
}
.detail-header > div {
  min-width: 0;
  flex: 1;
}
.detail-header h2 {
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0 0 6px;
}
.detail-header p {
  font-size: 11px;
  margin: 0;
  color: #5f6368;
}
.detail-icon-button {
  border: 0;
  width: 36px;
  height: 36px;
  background: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #5f6368;
  cursor: pointer;
  flex-shrink: 0;
}
.detail-icon-button:hover {
  background: #edf2f8;
}
.detail-content {
  display: flex;
  flex: 1;
  overflow: auto;
  min-height: 0;
}
.preview-area {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  min-height: 440px;
  background: #f1f4f9;
  padding: 25px;
  position: relative;
  overflow: hidden;
}
.image-preview {
  display: block;
  object-fit: contain;
  max-height: calc(100dvh - 270px);
  max-width: 100%;
  border-radius: 5px;
  box-shadow: 0 3px 18px #2a43681a;
}
.pdf-preview {
  width: 100%;
  height: calc(100dvh - 270px);
  min-height: 390px;
  border: 0;
  background: #fff;
  box-shadow: 0 2px 15px #2a43681a;
}
.details-sidebar {
  padding: 25px 24px;
  width: 265px;
  flex-shrink: 0;
  background: #fff;
  border-left: 1px solid #e7ebf0;
  overflow-wrap: anywhere;
}
.details-sidebar h3 {
  font-weight: 500;
  font-size: 14px;
  margin: 0 0 23px;
}
.details-file-symbol {
  height: 94px;
  border-radius: 9px;
  background: #f1f5fc;
  display: grid;
  place-items: center;
  color: #7695c7;
  margin-bottom: 25px;
}
.details-sidebar dl {
  margin: 0;
}
.details-sidebar dl > div {
  margin-bottom: 20px;
}
.details-sidebar dt {
  font-size: 10px;
  font-weight: 500;
  color: #5f6368;
  margin-bottom: 7px;
}
.details-sidebar dd {
  font-size: 12px;
  line-height: 1.7;
  margin: 0;
  color: #30343b;
}
.full-name {
  font-weight: 500;
}
.detail-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  background: #e5edfc;
  color: #3b649f;
  font-size: 10px;
  margin-right: 7px;
}
.access-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-top: 1px solid #e9edf2;
  padding-top: 17px;
  color: #6c788b;
}
.access-note > svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.access-note p {
  font-size: 10px;
  line-height: 1.8;
  margin: 0;
}
.preview-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
  color: #6b7d98;
  max-width: 320px;
  padding: 25px 10px;
}
.placeholder-icon {
  width: 91px;
  height: 91px;
  border-radius: 22px;
  background: #e3eaf7;
  display: grid;
  place-items: center;
  margin-bottom: 24px;
  color: #7895c5;
}
.preview-placeholder strong {
  color: #33465f;
  font-size: 18px;
  line-height: 1.5;
  font-weight: 400;
}
.preview-placeholder p {
  font-size: 12px;
  line-height: 1.8;
  margin: 11px 0 23px;
  color: #69768a;
  overflow-wrap: anywhere;
}
.download-button {
  min-height: 38px;
  background: #c2e7ff;
  color: #001d35;
  border: 1px solid transparent;
  cursor: pointer;
  border-radius: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 17px;
  font:
    500 12px Roboto,
    Arial,
    sans-serif;
  white-space: nowrap;
}
.download-button:hover {
  background: #afdffc;
}
.download-button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.detail-footer {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 15px 23px;
  border-top: 1px solid #e7ebf0;
}
.write-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}
.quiet-button {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 10px;
  border: 0;
  border-radius: 20px;
  background: none;
  color: #5f6368;
  cursor: pointer;
  font:
    12px Roboto,
    Arial,
    sans-serif;
}
.quiet-button:hover {
  background: #edf2f8;
}
.danger {
  color: #b3261e;
}
.danger:hover {
  background: #fff0ee;
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #d3e3fd;
  border-top-color: #0b57d0;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 23px;
}
.error-preview .placeholder-icon {
  background: #fbe8e6;
  color: #b85650;
}
.detail-dialog button:focus-visible,
.detail-dialog iframe:focus-visible {
  outline: 2px solid #0b57d0;
  outline-offset: 3px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 850px) {
  .detail-backdrop {
    padding: 20px;
  }
  .detail-dialog {
    max-height: calc(100dvh - 40px);
  }
  .details-sidebar {
    width: 222px;
    padding: 23px 19px;
  }
  .preview-area {
    min-height: 410px;
    padding: 18px;
  }
  .detail-header {
    padding: 17px 20px;
  }
  .detail-footer {
    padding: 14px 20px;
  }
  .image-preview {
    max-height: calc(100dvh - 240px);
  }
  .pdf-preview {
    height: calc(100dvh - 240px);
  }
}
@media (max-width: 640px) {
  .detail-backdrop {
    padding: 10px;
  }
  .detail-dialog {
    border-radius: 16px;
    max-height: calc(100dvh - 20px);
  }
  .detail-header {
    padding: 15px;
    gap: 10px;
  }
  .detail-header h2 {
    font-size: 14px;
  }
  .header-file-icon {
    width: 34px;
    height: 38px;
  }
  .detail-content {
    display: block;
  }
  .preview-area {
    min-height: 300px;
    padding: 20px;
  }
  .image-preview {
    max-height: 45dvh;
  }
  .pdf-preview {
    height: 53dvh;
    min-height: 320px;
  }
  .details-sidebar {
    border-left: 0;
    border-top: 1px solid #e7ebf0;
    width: auto;
    padding: 20px;
  }
  .details-file-symbol {
    display: none;
  }
  .details-sidebar h3 {
    margin-bottom: 18px;
    font-size: 13px;
  }
  .details-sidebar dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px 20px;
  }
  .details-sidebar dl > div {
    margin-bottom: 0;
  }
  .details-sidebar dd {
    font-size: 11px;
  }
  .access-note {
    margin-top: 19px;
  }
  .detail-footer {
    padding: 13px 14px;
    gap: 9px;
  }
  .quiet-button {
    padding: 8px;
    gap: 5px;
    font-size: 11px;
  }
  .download-button {
    padding-inline: 13px;
    font-size: 11px;
  }
  .preview-placeholder strong {
    font-size: 17px;
  }
  .preview-placeholder p {
    font-size: 11px;
  }
  .preview-placeholder {
    padding: 15px 10px;
  }
  .placeholder-icon {
    height: 75px;
    width: 75px;
    margin-bottom: 18px;
  }
}
@media (max-width: 380px) {
  .quiet-button span {
    display: none;
  }
  .detail-footer {
    gap: 5px;
  }
  .details-sidebar dl {
    gap: 12px;
  }
  .detail-header h2 {
    font-size: 13px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
    border-top-color: #0b57d0;
    border-right-color: #0b57d0;
  }
}
</style>
