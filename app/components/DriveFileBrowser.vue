<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DriveNode } from '../../shared/types'
import {
  selectionFromFiles,
  selectionFromDrop,
  type FolderSelection,
} from '../services/folder-upload'

const props = defineProps<{
  nodes: DriveNode[]
  loading: boolean
  error: string
  canWrite: boolean
  breadcrumbs: { id: string | null; name: string }[]
  title: string
  subtitle: string
  view: 'list' | 'grid'
  query: string
  filter: 'all' | 'documents' | 'images'
  sort: 'updatedAt' | 'name' | 'size'
  recent: boolean
  uploading: boolean
  uploadProgress: number
  hasMore: boolean
  loadingMore: boolean
}>()

const emit = defineEmits<{
  open: [node: DriveNode]
  preview: [node: DriveNode]
  download: [node: DriveNode]
  rename: [node: DriveNode]
  move: [node: DriveNode]
  delete: [nodes: DriveNode[]]
  upload: [files: File[]]
  'upload-tree': [selection: FolderSelection]
  'upload-error': [message: string]
  'create-folder': []
  navigate: [folderId: string | null]
  search: [query: string]
  filter: [filter: 'all' | 'documents' | 'images']
  sort: [sort: 'updatedAt' | 'name' | 'size']
  'view-change': [view: 'list' | 'grid']
  refresh: []
  'load-more': []
}>()

const input = ref<HTMLInputElement | null>(null)
const directoryInput = ref<HTMLInputElement | null>(null)
const scanning = ref(false)
const selection = ref<Set<string>>(new Set())
const dragDepth = ref(0)
const menuId = ref<string | null>(null)
const menuPosition = ref({ top: '0px', left: '0px' })
const menuElement = ref<HTMLElement | null>(null)
const selectedNodes = computed(() => props.nodes.filter((node) => selection.value.has(node.id)))
const allSelected = computed(
  () => props.nodes.length > 0 && selectedNodes.value.length === props.nodes.length,
)
const someSelected = computed(() => selectedNodes.value.length > 0 && !allSelected.value)
const showFolderCards = computed(
  () => props.view === 'list' && !props.recent && !props.query.trim() && props.filter === 'all',
)
const folders = computed(() =>
  showFolderCards.value ? props.nodes.filter((node) => node.kind === 'folder') : [],
)
const tableNodes = computed(() =>
  showFolderCards.value ? props.nodes.filter((node) => node.kind === 'file') : props.nodes,
)
const menuNode = computed(() => props.nodes.find((node) => node.id === menuId.value))
const progress = computed(() => Math.round(Math.max(0, Math.min(100, props.uploadProgress || 0))))
const filters = [
  { value: 'all', label: 'Tüm türler' },
  { value: 'documents', label: 'Belgeler' },
  { value: 'images', label: 'Görseller' },
] as const

watch(
  () => props.nodes,
  () => {
    selection.value = new Set()
    menuId.value = null
  },
)
watch(
  () => props.canWrite,
  () => {
    dragDepth.value = 0
    menuId.value = null
  },
)

function toggleSelection(id: string) {
  const next = new Set(selection.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selection.value = next
}
function clearFilters() {
  emit('search', '')
  emit('filter', 'all')
}

function selectAll() {
  selection.value = allSelected.value ? new Set() : new Set(props.nodes.map((node) => node.id))
}

function activate(node: DriveNode) {
  if (node.kind === 'folder') emit('open', node)
  else emit('preview', node)
}

function fileIcon(node: DriveNode) {
  if (node.kind === 'folder') return 'folder'
  if (node.mimeType?.startsWith('image/')) return 'image'
  if (/spreadsheet|excel|csv/.test(node.mimeType || '')) return 'sheet'
  if (/presentation|powerpoint/.test(node.mimeType || '')) return 'slides'
  return 'file'
}

function fileTone(node: DriveNode) {
  if (node.kind === 'folder') return 'folder'
  const icon = fileIcon(node)
  if (icon === 'image') return 'image'
  if (icon === 'sheet') return 'sheet'
  if (icon === 'slides') return 'slides'
  return node.mimeType === 'application/pdf' ? 'pdf' : 'document'
}

function fileType(node: DriveNode) {
  if (node.kind === 'folder') return 'Klasör'
  if (node.mimeType === 'application/pdf') return 'PDF belgesi'
  if (node.mimeType?.startsWith('image/')) return 'Görsel'
  if (fileIcon(node) === 'sheet') return 'E-tablo'
  if (fileIcon(node) === 'slides') return 'Sunum'
  if (node.mimeType?.startsWith('video/')) return 'Video'
  return 'Dosya'
}

function formatSize(size?: number) {
  if (size === undefined || !Number.isFinite(size)) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024)
    return `${(size / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`
  return `${(size / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function chooseFiles() {
  if (props.canWrite && !props.uploading) input.value?.click()
}

function handleFileInput(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (files.length && props.canWrite && !props.uploading) emit('upload', files)
  target.value = ''
}

function handleDirectoryInput(event: Event) {
  const target = event.target as HTMLInputElement
  try {
    if (props.canWrite && !props.uploading && target.files?.length)
      emit('upload-tree', selectionFromFiles(Array.from(target.files)))
  } catch (cause) {
    emit('upload-error', cause instanceof Error ? cause.message : 'Klasör okunamadı.')
  } finally {
    target.value = ''
  }
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

function onDragEnter(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  if (props.canWrite && !props.uploading) dragDepth.value++
}

function onDragLeave(event: DragEvent) {
  if (!hasFiles(event)) return
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDragOver(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = props.canWrite && !props.uploading ? 'copy' : 'none'
}

async function onDrop(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  dragDepth.value = 0
  if (!props.canWrite || props.uploading) return
  if (!event.dataTransfer || scanning.value) return
  scanning.value = true
  try {
    const result = await selectionFromDrop(event.dataTransfer)
    if (props.canWrite && !props.uploading) emit('upload-tree', result)
  } catch (cause) {
    emit('upload-error', cause instanceof Error ? cause.message : 'Klasör okunamadı.')
  } finally {
    scanning.value = false
  }
}

async function toggleMenu(node: DriveNode, event: MouseEvent) {
  if (menuId.value === node.id) {
    closeMenu()
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const height = props.canWrite ? 250 : 110
  menuPosition.value = {
    left: `${Math.max(8, Math.min(rect.right - 216, window.innerWidth - 224))}px`,
    top: `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8))}px`,
  }
  menuId.value = node.id
  await nextTick()
  menuElement.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

function closeMenu(returnFocus = false) {
  const id = menuId.value
  menuId.value = null
  if (returnFocus && id) document.getElementById(`file-actions-${id}`)?.focus()
}

function handleMenuKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu(true)
    return
  }
  if (event.key === 'Tab') {
    closeMenu(true)
    return
  }
  const buttons = Array.from(menuElement.value?.querySelectorAll<HTMLButtonElement>('button') || [])
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (
    event.key === 'ArrowDown' ||
    event.key === 'ArrowUp' ||
    event.key === 'Home' ||
    event.key === 'End'
  ) {
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
}

function menuAction(action: 'open' | 'download' | 'rename' | 'move' | 'delete') {
  const node = menuNode.value
  closeMenu(true)
  if (!node) return
  if (action === 'open') activate(node)
  if (action === 'download') emit('download', node)
  if (!props.canWrite) return
  if (action === 'rename') emit('rename', node)
  if (action === 'move') emit('move', node)
  if (action === 'delete') emit('delete', [node])
}

function outsideClick(event: MouseEvent) {
  if (!(event.target as HTMLElement)?.closest('[data-file-menu], [data-file-menu-trigger]'))
    closeMenu()
}

function dismissMenu() {
  closeMenu()
}
onMounted(() => {
  document.addEventListener('click', outsideClick)
  window.addEventListener('resize', dismissMenu)
  window.addEventListener('scroll', dismissMenu, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', outsideClick)
  window.removeEventListener('resize', dismissMenu)
  window.removeEventListener('scroll', dismissMenu, true)
})
</script>

<template>
  <section
    class="file-browser"
    :aria-busy="loading"
    aria-label="Dosya alanı"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <input
      ref="input"
      class="sr-only"
      type="file"
      multiple
      tabindex="-1"
      aria-label="Yüklenecek dosyaları seç"
      :disabled="!canWrite || uploading"
      @change="handleFileInput"
    />

    <input
      ref="directoryInput"
      class="sr-only"
      type="file"
      webkitdirectory
      multiple
      tabindex="-1"
      aria-label="Yüklenecek klasörü seç"
      :disabled="!canWrite || uploading || scanning"
      @change="handleDirectoryInput"
    />
    <p v-if="scanning" role="status">Klasörler okunuyor…</p>

    <header class="page-header">
      <div class="heading-copy">
        <nav v-if="breadcrumbs.length > 1" class="breadcrumbs" aria-label="Klasör yolu">
          <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id || 'root'">
            <AppIcon v-if="index" name="chevron" :size="16" />
            <button
              v-if="index < breadcrumbs.length - 1"
              type="button"
              @click="emit('navigate', crumb.id)"
            >
              {{ crumb.name }}
            </button>
            <span v-else aria-current="page">{{ crumb.name }}</span>
          </template>
        </nav>
        <h1>{{ title }}</h1>
        <p>{{ subtitle }}</p>
      </div>
      <div v-if="canWrite" class="page-actions">
        <button class="outline-button folder-action" type="button" @click="emit('create-folder')">
          <AppIcon name="plus" :size="18" />Yeni klasör
        </button>
        <button
          class="outline-button"
          type="button"
          :disabled="uploading || scanning"
          @click="directoryInput?.click()"
        >
          <AppIcon name="upload" :size="18" />Klasör yükle
        </button>
        <button
          class="primary-button"
          type="button"
          :disabled="uploading || scanning"
          @click="chooseFiles"
        >
          <AppIcon name="upload" :size="18" />{{ uploading ? 'Yükleniyor…' : 'Dosya yükle' }}
        </button>
      </div>
      <span v-else class="readonly-label"
        ><AppIcon name="eye" :size="16" />Yalnızca görüntüleme</span
      >
    </header>

    <p v-if="canWrite && !uploading" class="folder-upload-help">
      Boş alt klasörleri de korumak için klasörünü buraya sürükleyip bırakabilirsin.
    </p>
    <div v-if="uploading" class="upload-notice" role="status" aria-live="polite">
      <span class="upload-notice-icon"><AppIcon name="upload" :size="20" /></span>
      <div>
        <strong>Dosyalar yükleniyor</strong><span>Bu pencereyi açık tutabilirsin.</span>
        <div
          class="progress-track"
          role="progressbar"
          :aria-valuenow="progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Dosya yükleme ilerlemesi"
        >
          <i :style="{ width: `${progress}%` }" />
        </div>
      </div>
      <b>%{{ progress }}</b>
    </div>

    <div class="file-toolbar">
      <div class="filters" role="group" aria-label="Dosya türüne göre filtrele">
        <button
          v-for="item in filters"
          :key="item.value"
          type="button"
          :class="['filter-button', { active: filter === item.value }]"
          :aria-pressed="filter === item.value"
          @click="emit('filter', item.value)"
        >
          <AppIcon v-if="filter === item.value" name="check" :size="15" />{{ item.label }}
        </button>
      </div>
      <div class="toolbar-options">
        <label class="sort-label"
          ><span class="sr-only">Sıralama</span
          ><select
            :value="sort"
            @change="
              emit(
                'sort',
                ($event.target as HTMLSelectElement).value as 'updatedAt' | 'name' | 'size',
              )
            "
          >
            <option value="updatedAt">Son değiştirilme</option>
            <option value="name">Ada göre</option>
            <option value="size">Boyuta göre</option>
          </select></label
        >
        <div class="view-toggle" role="group" aria-label="Dosya görünümü">
          <button
            type="button"
            title="Liste görünümü"
            aria-label="Liste görünümü"
            :aria-pressed="view === 'list'"
            :class="{ active: view === 'list' }"
            @click="emit('view-change', 'list')"
          >
            <AppIcon name="list" :size="18" /></button
          ><button
            type="button"
            title="Izgara görünümü"
            aria-label="Izgara görünümü"
            :aria-pressed="view === 'grid'"
            :class="{ active: view === 'grid' }"
            @click="emit('view-change', 'grid')"
          >
            <AppIcon name="grid" :size="18" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-banner" role="alert">
      <AppIcon name="info" :size="20" />
      <p>{{ error }}</p>
      <button type="button" @click="emit('refresh')">
        <AppIcon name="refresh" :size="17" />Tekrar dene
      </button>
    </div>

    <div v-if="loading" class="loading-state" role="status" aria-label="Dosyalar yükleniyor">
      <span class="sr-only">Dosyalar yükleniyor…</span>
      <div v-for="row in 5" :key="row" class="skeleton-row"><i /><span /><b /></div>
    </div>

    <template v-else-if="nodes.length">
      <div v-if="selectedNodes.length" class="selection-bar" role="status">
        <button
          class="icon-button"
          type="button"
          aria-label="Seçimi temizle"
          @click="selection = new Set()"
        >
          <AppIcon name="close" :size="19" />
        </button>
        <strong>{{ selectedNodes.length }} öğe seçildi</strong>
        <button
          v-if="canWrite"
          class="selection-delete"
          type="button"
          @click="emit('delete', selectedNodes)"
        >
          <AppIcon name="trash" :size="18" /><span>Sil</span>
        </button>
        <span v-else class="selection-hint">Görüntüleme yetkisi</span>
      </div>

      <div v-if="folders.length" class="folder-section">
        <div class="section-caption">
          <h2>Klasörler</h2>
          <span>{{ folders.length }} klasör</span>
        </div>
        <div class="folder-grid">
          <article
            v-for="node in folders"
            :key="node.id"
            :class="['folder-card', { selected: selection.has(node.id) }]"
          >
            <input
              class="item-checkbox"
              type="checkbox"
              :checked="selection.has(node.id)"
              :aria-label="`${node.name} klasörünü seç`"
              @change="toggleSelection(node.id)"
            />
            <button class="folder-open" type="button" :title="node.name" @click="activate(node)">
              <AppIcon name="folder" :size="24" /><span>{{ node.name }}</span>
            </button>
            <button
              :id="`file-actions-${node.id}`"
              class="icon-button"
              type="button"
              data-file-menu-trigger
              :aria-label="`${node.name} için işlemler`"
              aria-haspopup="menu"
              :aria-expanded="menuId === node.id"
              @click.stop="toggleMenu(node, $event)"
            >
              <AppIcon name="more" :size="19" />
            </button>
          </article>
        </div>
      </div>

      <div class="section-caption file-caption">
        <h2>{{ recent ? 'Son kullanılan dosyalar' : query ? 'Arama sonuçları' : 'Dosyalar' }}</h2>
        <span>{{ tableNodes.length }} öğe</span
        ><button class="select-all-button" type="button" @click="selectAll">
          {{ allSelected ? 'Seçimi temizle' : 'Tümünü seç' }}
        </button>
      </div>

      <div v-if="view === 'list' && tableNodes.length" class="table-wrap">
        <table class="file-table">
          <caption class="sr-only">
            {{
              title
            }}
            dosya listesi
          </caption>
          <thead>
            <tr>
              <th class="check-column">
                <input
                  type="checkbox"
                  :checked="allSelected"
                  :indeterminate="someSelected"
                  aria-label="Tüm öğeleri seç"
                  @change="selectAll"
                />
              </th>
              <th scope="col">Ad</th>
              <th scope="col" class="owner-column">Sahibi</th>
              <th scope="col" class="date-column">Son değiştirilme</th>
              <th scope="col" class="size-column">Boyut</th>
              <th class="actions-column"><span class="sr-only">İşlemler</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="node in tableNodes"
              :key="node.id"
              :class="{ selected: selection.has(node.id) }"
            >
              <td class="check-column">
                <input
                  type="checkbox"
                  :checked="selection.has(node.id)"
                  :aria-label="`${node.name} öğesini seç`"
                  @change="toggleSelection(node.id)"
                />
              </td>
              <td>
                <button class="file-name" type="button" :title="node.name" @click="activate(node)">
                  <span :class="['file-icon', fileTone(node)]"
                    ><AppIcon :name="fileIcon(node)" :size="23" /></span
                  ><span class="file-name-copy"
                    ><strong>{{ node.name }}</strong
                    ><small>{{ fileType(node) }}</small></span
                  >
                </button>
              </td>
              <td class="owner-column">
                <span class="owner-avatar">{{
                  (node.createdBy?.name || '?').slice(0, 1).toLocaleUpperCase('tr-TR')
                }}</span
                >{{ node.createdBy?.name || '—' }}
              </td>
              <td class="date-column">{{ formatDate(node.updatedAt) }}</td>
              <td class="size-column">
                {{ node.kind === 'folder' ? '—' : formatSize(node.size) }}
              </td>
              <td class="actions-column">
                <button
                  :id="`file-actions-${node.id}`"
                  class="icon-button"
                  type="button"
                  data-file-menu-trigger
                  :aria-label="`${node.name} için işlemler`"
                  aria-haspopup="menu"
                  :aria-expanded="menuId === node.id"
                  @click.stop="toggleMenu(node, $event)"
                >
                  <AppIcon name="more" :size="19" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="view === 'grid'" class="files-grid">
        <article
          v-for="node in nodes"
          :key="node.id"
          :class="['file-card', fileTone(node), { selected: selection.has(node.id) }]"
        >
          <div class="card-top">
            <input
              type="checkbox"
              :checked="selection.has(node.id)"
              :aria-label="`${node.name} öğesini seç`"
              @change="toggleSelection(node.id)"
            /><span>{{ fileType(node) }}</span
            ><button
              :id="`file-actions-${node.id}`"
              class="icon-button"
              type="button"
              data-file-menu-trigger
              :aria-label="`${node.name} için işlemler`"
              aria-haspopup="menu"
              :aria-expanded="menuId === node.id"
              @click.stop="toggleMenu(node, $event)"
            >
              <AppIcon name="more" :size="19" />
            </button>
          </div>
          <button
            class="card-open"
            type="button"
            :aria-label="`${node.name} ${node.kind === 'folder' ? 'klasörünü aç' : 'dosyasını önizle'}`"
            @click="activate(node)"
          >
            <span :class="['card-preview', fileTone(node)]" aria-hidden="true"
              ><AppIcon
                v-if="node.kind === 'folder' || fileIcon(node) === 'image'"
                :name="fileIcon(node)"
                :size="64" /><span v-else class="paper-preview"
                ><AppIcon :name="fileIcon(node)" :size="24" /><i /><i /><i /><i /><i /></span
            ></span>
            <span class="card-name"
              ><AppIcon :name="fileIcon(node)" :size="20" /><strong :title="node.name">{{
                node.name
              }}</strong></span
            >
          </button>
          <div class="card-meta">
            <span>{{ formatDate(node.updatedAt) }}</span
            ><span>{{ node.kind === 'folder' ? 'Klasör' : formatSize(node.size) }}</span>
          </div>
        </article>
      </div>

      <div v-else-if="!tableNodes.length" class="folder-only-note">
        <AppIcon name="file" :size="22" /><span>Bu klasörde henüz dosya yok.</span
        ><button v-if="canWrite" type="button" :disabled="uploading" @click="chooseFiles">
          Dosya yükle
        </button>
      </div>
      <footer class="file-footer">
        <span>{{ nodes.length }} öğe gösteriliyor</span
        ><span
          ><AppIcon :name="canWrite ? 'shield' : 'eye'" :size="14" />{{
            canWrite ? 'Dosyaları düzenleyebilirsin' : 'Dosyaları görüntüleyebilirsin'
          }}</span
        >
      </footer>
    </template>

    <div v-else-if="!error" class="empty-state">
      <div class="empty-art" aria-hidden="true">
        <span /><AppIcon :name="query || filter !== 'all' ? 'search' : 'folder'" :size="57" /><i />
      </div>
      <h2>
        {{
          hasMore
            ? 'Sonuçlar devam ediyor'
            : query || filter !== 'all'
              ? 'Eşleşen dosya bulunamadı'
              : recent
                ? 'Henüz son kullanılan dosya yok'
                : 'Dosyaların için yeni bir başlangıç'
        }}
      </h2>
      <p>
        {{
          hasMore
            ? 'Bu sayfada gösterilecek içerik yok. Sonraki sonuçlara devam edebilirsin.'
            : query || filter !== 'all'
              ? 'Farklı bir arama yapabilir veya dosya türü filtresini kaldırabilirsin.'
              : recent
                ? 'Çalışma alanındaki dosyaları açtıkça burada göreceksin.'
                : canWrite
                  ? 'İlk dosyanı yükle veya işlerini düzenlemek için bir klasör oluştur.'
                  : 'Takımın dosya eklediğinde bu alanda görüntüleyebilirsin.'
        }}
      </p>
      <button
        v-if="query || filter !== 'all'"
        class="outline-button"
        type="button"
        @click="clearFilters"
      >
        Filtreleri temizle
      </button>
      <div v-else-if="canWrite && !recent" class="empty-actions">
        <button
          class="outline-button"
          type="button"
          :disabled="uploading || scanning"
          @click="directoryInput?.click()"
        >
          <AppIcon name="upload" :size="18" />Klasör yükle
        </button>
        <button
          class="primary-button"
          type="button"
          :disabled="uploading || scanning"
          @click="chooseFiles"
        >
          <AppIcon name="upload" :size="18" />Dosya yükle</button
        ><button class="outline-button" type="button" @click="emit('create-folder')">
          Klasör oluştur
        </button>
      </div>
    </div>

    <div v-if="!loading && hasMore" class="load-more">
      <button
        class="outline-button"
        type="button"
        :disabled="loadingMore"
        @click="emit('load-more')"
      >
        {{ loadingMore ? 'Yükleniyor…' : 'Daha fazla öğe' }}
      </button>
    </div>
    <div v-if="dragDepth > 0 && canWrite && !uploading" class="drop-overlay" aria-hidden="true">
      <AppIcon name="upload" :size="43" /><strong>Dosyalarını buraya bırak</strong
      ><span>Geçerli klasöre yüklenecek</span>
    </div>

    <Teleport to="body">
      <div
        v-if="menuNode"
        ref="menuElement"
        class="file-action-menu"
        data-file-menu
        role="menu"
        :aria-label="`${menuNode.name} işlemleri`"
        :style="menuPosition"
        @keydown="handleMenuKey"
      >
        <button role="menuitem" type="button" @click="menuAction('open')">
          <AppIcon :name="menuNode.kind === 'folder' ? 'folder' : 'eye'" :size="18" />{{
            menuNode.kind === 'folder' ? 'Klasörü aç' : 'Önizle ve ayrıntılar'
          }}
        </button>
        <button role="menuitem" type="button" @click="menuAction('download')">
          <AppIcon name="download" :size="18" />{{
            menuNode.kind === 'folder' ? 'ZIP olarak indir' : 'İndir'
          }}
        </button>
        <template v-if="canWrite"
          ><div class="menu-divider" role="separator" />
          <button role="menuitem" type="button" @click="menuAction('rename')">
            <AppIcon name="edit" :size="18" />Yeniden adlandır</button
          ><button role="menuitem" type="button" @click="menuAction('move')">
            <AppIcon name="move" :size="18" />Taşı
          </button>
          <div class="menu-divider" role="separator" />
          <button class="danger" role="menuitem" type="button" @click="menuAction('delete')">
            <AppIcon name="trash" :size="18" />Sil
          </button></template
        >
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.page-actions {
  flex-wrap: wrap;
}
.folder-upload-help {
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted);
  margin: 0 0 18px;
}
.load-more {
  padding: 20px 0;
  text-align: center;
}
.file-browser {
  position: relative;
  min-height: calc(100vh - 136px);
  color: var(--text, #1f1f1f);
  padding: 29px 30px 20px;
  background: var(--surface, #fff);
  border-radius: 22px;
  font:
    14px Roboto,
    Arial,
    sans-serif;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 29px;
}
.heading-copy {
  min-width: 0;
}
.heading-copy h1 {
  font-size: 25px;
  font-weight: 400;
  letter-spacing: -0.55px;
  line-height: 1.3;
  margin: 0 0 10px;
  overflow-wrap: anywhere;
}
.heading-copy p {
  font-size: 13px;
  color: var(--muted, #5f6368);
  margin: 0;
  line-height: 1.6;
}
.page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.primary-button,
.outline-button {
  min-height: 40px;
  padding: 0 18px;
  border-radius: 24px;
  display: inline-flex;
  gap: 9px;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--line, #e1e3e6);
  cursor: pointer;
  white-space: nowrap;
  color: var(--accent, #0b57d0);
  background: #fff;
}
.primary-button {
  background: #c2e7ff;
  color: #001d35;
  border-color: transparent;
}
.primary-button:hover {
  background: #b3dffb;
  box-shadow: 0 1px 3px #3c404326;
}
.outline-button:hover {
  background: #f1f5fb;
}
.primary-button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.breadcrumbs {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--muted, #5f6368);
  margin-bottom: 12px;
  flex-wrap: wrap;
  font-size: 12px;
}
.breadcrumbs button {
  border: 0;
  background: none;
  color: var(--accent, #0b57d0);
  padding: 3px 0;
  cursor: pointer;
  font: inherit;
}
.breadcrumbs span {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.readonly-label {
  font-size: 12px;
  color: var(--muted, #5f6368);
  display: flex;
  gap: 7px;
  align-items: center;
  white-space: nowrap;
  padding: 8px 10px;
  background: #f1f3f4;
  border-radius: 8px;
}
.file-toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 26px;
  flex-wrap: wrap;
}
.filters {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-button {
  min-height: 33px;
  border: 1px solid #747775;
  border-radius: 8px;
  background: #fff;
  padding: 5px 12px;
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: var(--text, #1f1f1f);
  cursor: pointer;
}
.filter-button.active {
  border-color: #c2e7ff;
  background: #c2e7ff;
  color: #001d35;
}
.filter-button:hover {
  background: #edf2f8;
}
.toolbar-options {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-left: auto;
}
.sort-label select {
  max-width: 170px;
  padding: 8px 22px 8px 7px;
  border: 0;
  background: #fff;
  color: var(--muted, #5f6368);
  font:
    12px Roboto,
    Arial,
    sans-serif;
  cursor: pointer;
}
.view-toggle {
  border: 1px solid #747775;
  border-radius: 22px;
  display: flex;
  overflow: hidden;
}
.view-toggle button {
  width: 42px;
  height: 32px;
  border: 0;
  background: #fff;
  display: grid;
  place-items: center;
  color: var(--muted, #5f6368);
  cursor: pointer;
}
.view-toggle button + button {
  border-left: 1px solid #747775;
}
.view-toggle button.active {
  background: var(--accent-soft, #d3e3fd);
  color: var(--accent, #0b57d0);
}
.view-toggle button:hover {
  background: #edf2f8;
}
.section-caption {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 13px;
  color: var(--muted, #5f6368);
  font-size: 12px;
}
.section-caption h2 {
  color: var(--text, #1f1f1f);
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}
.section-caption > span {
  font-size: 11px;
  color: #7b8087;
}
.folder-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 13px;
  margin-bottom: 31px;
}
.folder-card {
  display: flex;
  align-items: center;
  background: #f1f3f4;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 12px 9px 12px 13px;
  min-width: 0;
  gap: 5px;
  position: relative;
  min-height: 63px;
}
.folder-card:hover {
  background: #e9edf3;
}
.folder-card.selected {
  background: var(--accent-soft, #d3e3fd);
  border-color: #a8c7fa;
}
.folder-open {
  display: flex;
  min-width: 0;
  flex: 1;
  gap: 12px;
  align-items: center;
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--text, #1f1f1f);
  padding: 4px 1px;
  text-align: left;
  font:
    500 13px Roboto,
    Arial,
    sans-serif;
}
.folder-open > svg {
  color: var(--muted, #5f6368);
  flex-shrink: 0;
}
.folder-open span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-checkbox {
  position: absolute;
  top: -6px;
  left: -6px;
  opacity: 0;
  z-index: 1;
}
.folder-card:hover .item-checkbox,
.folder-card:focus-within .item-checkbox,
.folder-card.selected .item-checkbox {
  opacity: 1;
}
.icon-button {
  border: 0;
  background: none;
  border-radius: 50%;
  width: 33px;
  height: 33px;
  padding: 0;
  display: inline-grid;
  place-items: center;
  color: var(--muted, #5f6368);
  flex-shrink: 0;
  cursor: pointer;
}
.icon-button:hover {
  background: #dce4ef;
  color: var(--text, #1f1f1f);
}
.select-all-button {
  margin-left: auto;
  color: var(--accent, #0b57d0);
  background: none;
  border: 0;
  cursor: pointer;
  font:
    500 12px Roboto,
    Arial,
    sans-serif;
  padding: 4px 0;
}
.file-table {
  border-collapse: collapse;
  width: 100%;
  table-layout: fixed;
  font-size: 12px;
}
.file-table th {
  text-align: left;
  font-weight: 500;
  color: var(--muted, #5f6368);
  height: 41px;
  border-bottom: 1px solid #c7c7c7;
  white-space: nowrap;
}
.file-table td {
  height: 61px;
  border-bottom: 1px solid #eceef0;
  padding: 0 10px 0 0;
  vertical-align: middle;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-table tbody tr:hover {
  background: #f7f9fc;
}
.file-table tbody tr.selected {
  background: #d3e3fd;
}
.check-column {
  width: 34px;
  text-align: center !important;
  padding-right: 6px !important;
}
.owner-column {
  width: 19%;
}
.date-column {
  width: 17%;
}
.size-column {
  width: 12%;
}
.actions-column {
  width: 39px;
  padding-right: 0 !important;
}
.file-name {
  padding: 9px 4px 9px 0;
  border: 0;
  background: none;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  cursor: pointer;
  text-align: left;
  color: var(--text, #1f1f1f);
}
.file-icon {
  width: 29px;
  height: 35px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.file-icon.document {
  color: #4285f4;
}
.file-icon.pdf {
  color: #d64545;
}
.file-icon.image {
  color: #b062c5;
}
.file-icon.sheet {
  color: #18896a;
}
.file-icon.slides {
  color: #e6a23a;
}
.file-icon.folder {
  color: #70757a;
}
.file-name-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.file-name-copy strong {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-name-copy small {
  font-size: 10px;
  color: var(--muted, #5f6368);
}
.owner-avatar {
  display: inline-grid;
  place-items: center;
  width: 23px;
  height: 23px;
  background: #e8eff9;
  color: #44628e;
  border-radius: 50%;
  font-size: 10px;
  margin-right: 7px;
}
.selection-bar {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 9px;
  background: #e8f0fe;
  margin-bottom: 20px;
  padding: 4px 10px;
  font-size: 12px;
}
.selection-bar strong {
  font-weight: 500;
}
.selection-delete {
  display: flex;
  align-items: center;
  gap: 7px;
  background: none;
  border: 0;
  padding: 7px 10px;
  margin-left: auto;
  color: #b3261e;
  cursor: pointer;
  font:
    500 12px Roboto,
    Arial,
    sans-serif;
  border-radius: 20px;
}
.selection-delete:hover {
  background: #fce8e6;
}
.selection-hint {
  margin-left: auto;
  color: var(--muted, #5f6368);
  font-size: 11px;
}
.file-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--muted, #5f6368);
  font-size: 10px;
  padding: 18px 0 4px;
}
.file-footer > span:last-child {
  display: flex;
  align-items: center;
  gap: 5px;
}
.files-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.file-card {
  border: 1px solid #e3e7ed;
  border-radius: 13px;
  background: #f3f6fa;
  overflow: hidden;
  min-width: 0;
}
.file-card:hover {
  border-color: #bfcee4;
  background: #eaf0fa;
}
.file-card.selected {
  border-color: #a8c7fa;
  background: #d3e3fd;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 7px 3px 11px;
  height: 38px;
  color: var(--muted, #5f6368);
  font-size: 10px;
}
.card-top .icon-button {
  margin-left: auto;
  width: 28px;
  height: 28px;
}
.card-top input {
  width: 14px;
  height: 14px;
}
.card-open {
  display: block;
  width: 100%;
  border: 0;
  background: none;
  cursor: pointer;
  padding: 0 8px;
  text-align: left;
  color: inherit;
}
.card-preview {
  height: 139px;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  background: #e8edf4;
  border-radius: 7px;
  margin-bottom: 13px;
}
.card-preview.image {
  color: #a57ab4;
  background: linear-gradient(135deg, #f0e9f7, #e5e8f4);
}
.card-preview.folder {
  color: #7a8ba6;
  background: #e8edf4;
}
.paper-preview {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
  width: 95px;
  height: 124px;
  background: #fff;
  box-shadow: 0 2px 6px #49617b15;
  padding: 13px 11px;
  transform: translateY(16px) rotate(-3deg);
  color: #4285f4;
}
.paper-preview i {
  display: block;
  height: 3px;
  border-radius: 2px;
  background: #e4e9f0;
  width: 100%;
}
.paper-preview i:nth-last-child(2) {
  width: 80%;
}
.paper-preview i:last-child {
  width: 65%;
}
.pdf .paper-preview {
  color: #d64545;
}
.sheet .paper-preview {
  color: #18896a;
}
.sheet .paper-preview i {
  height: 7px;
  border-radius: 0;
  background: repeating-linear-gradient(90deg, #d7eadf 0, #d7eadf 18px, #fff 18px, #fff 20px);
}
.slides .paper-preview {
  color: #e6a23a;
}
.slides .paper-preview i {
  background: #fff1cf;
}
.card-name {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 4px;
}
.card-name strong {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-name > svg {
  color: #697a96;
  flex-shrink: 0;
}
.card-meta {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 8px 12px 13px;
  font-size: 9px;
  color: var(--muted, #5f6368);
}
.empty-state {
  display: flex;
  align-items: center;
  flex-direction: column;
  text-align: center;
  padding: 66px 16px 80px;
}
.empty-state h2 {
  font-weight: 400;
  font-size: 22px;
  margin: 20px 0 10px;
  letter-spacing: -0.3px;
}
.empty-state p {
  font-size: 13px;
  line-height: 1.8;
  color: var(--muted, #5f6368);
  max-width: 385px;
  margin: 0 0 23px;
}
.empty-art {
  width: 140px;
  height: 110px;
  display: grid;
  place-items: center;
  color: #7795c7;
  position: relative;
}
.empty-art > span {
  position: absolute;
  width: 114px;
  height: 84px;
  transform: rotate(-12deg);
  background: #eff4fc;
  border-radius: 29px;
}
.empty-art > svg {
  position: relative;
  z-index: 1;
}
.empty-art > i {
  position: absolute;
  bottom: 10px;
  right: 15px;
  width: 24px;
  height: 24px;
  border: 5px solid #fff;
  border-radius: 50%;
  background: #c2e7ff;
}
.empty-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #f0c8c5;
  background: #fff4f3;
  border-radius: 10px;
  padding: 12px 14px;
  color: #8c3029;
  margin-bottom: 22px;
}
.error-banner p {
  font-size: 12px;
  line-height: 1.6;
  flex: 1;
  margin: 0;
}
.error-banner > svg {
  flex-shrink: 0;
}
.error-banner button {
  display: flex;
  gap: 6px;
  align-items: center;
  border: 0;
  background: none;
  color: #8c3029;
  font-size: 12px;
  cursor: pointer;
  padding: 7px;
  white-space: nowrap;
}
.upload-notice {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  background: #edf4ff;
  border: 1px solid #d8e7ff;
  border-radius: 12px;
  margin-bottom: 23px;
}
.upload-notice > div {
  flex: 1;
}
.upload-notice strong {
  font-size: 12px;
  display: block;
  font-weight: 500;
}
.upload-notice span {
  font-size: 10px;
  color: var(--muted, #5f6368);
  display: block;
  margin-top: 4px;
}
.upload-notice > .upload-notice-icon {
  margin: 0;
  color: #0b57d0;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
}
.upload-notice > b {
  font-size: 12px;
  color: #0b57d0;
  font-weight: 500;
  align-self: flex-start;
  padding-top: 4px;
}
.progress-track {
  height: 4px;
  background: #d7e4f8;
  border-radius: 4px;
  margin-top: 10px;
  overflow: hidden;
}
.progress-track > i {
  display: block;
  background: #0b57d0;
  height: 100%;
  transition: width 0.15s;
  border-radius: 4px;
}
.loading-state {
  padding: 10px 0;
}
.skeleton-row {
  height: 68px;
  display: flex;
  gap: 14px;
  align-items: center;
  border-bottom: 1px solid #edf0f4;
}
.skeleton-row i,
.skeleton-row span,
.skeleton-row b {
  background: linear-gradient(90deg, #f1f3f6 20%, #e8edf4 50%, #f1f3f6 80%);
  background-size: 200% 100%;
  animation: shimmer 1.6s linear infinite;
  border-radius: 5px;
  display: block;
}
.skeleton-row i {
  width: 29px;
  height: 32px;
}
.skeleton-row span {
  height: 12px;
  width: 35%;
}
.skeleton-row b {
  height: 10px;
  width: 15%;
  margin-left: auto;
  margin-right: 5%;
}
.folder-only-note {
  display: flex;
  gap: 9px;
  color: var(--muted, #5f6368);
  font-size: 12px;
  align-items: center;
  padding: 25px 4px;
  border-block: 1px solid #edf0f4;
}
.folder-only-note button {
  border: 0;
  background: none;
  color: var(--accent, #0b57d0);
  cursor: pointer;
  font-size: 12px;
  margin-left: auto;
}
.drop-overlay {
  position: absolute;
  inset: 8px;
  background: #eaf3ffed;
  z-index: 12;
  border: 2px dashed #0b57d0;
  border-radius: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 15px;
  color: #0b57d0;
  pointer-events: none;
}
.drop-overlay strong {
  font-size: 24px;
  font-weight: 500;
}
.drop-overlay span {
  font-size: 13px;
}
.file-action-menu {
  position: fixed;
  z-index: 250;
  background: #fff;
  border: 1px solid #e1e3e6;
  border-radius: 10px;
  padding: 6px 0;
  box-shadow: 0 7px 22px #1f1f1f2a;
  width: 216px;
  color: #1f1f1f;
  font:
    13px Roboto,
    Arial,
    sans-serif;
}
.file-action-menu button {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  min-height: 39px;
  width: 100%;
  text-align: left;
  font: inherit;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
}
.file-action-menu button:hover,
.file-action-menu button:focus {
  background: #edf2f8;
  outline: 0;
}
.file-action-menu .danger {
  color: #b3261e;
}
.menu-divider {
  height: 1px;
  background: #e8eaed;
  margin: 4px 0;
}
input[type='checkbox'] {
  width: 15px;
  height: 15px;
  accent-color: #0b57d0;
  cursor: pointer;
  flex-shrink: 0;
}
button:focus-visible,
select:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent, #0b57d0);
  outline-offset: 3px;
}
.sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}
@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
@media (min-width: 1500px) {
  .folder-grid,
  .files-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
@media (max-width: 1160px) {
  .folder-grid,
  .files-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .owner-column {
    display: none;
  }
  .date-column {
    width: 25%;
  }
  .size-column {
    width: 15%;
  }
  .file-browser {
    padding: 25px 24px 18px;
  }
  .page-header {
    gap: 14px;
  }
  .page-actions {
    gap: 7px;
  }
  .folder-action {
    padding-inline: 12px;
  }
}
@media (max-width: 840px) {
  .folder-grid,
  .files-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .page-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .page-actions {
    margin-left: auto;
  }
  .file-toolbar {
    gap: 12px;
  }
  .toolbar-options {
    gap: 8px;
  }
  .heading-copy h1 {
    font-size: 24px;
  }
  .readonly-label {
    font-size: 10px;
  }
  .file-browser {
    padding: 24px 20px 18px;
  }
  .date-column {
    width: 26%;
  }
  .size-column {
    display: none;
  }
}
@media (max-width: 560px) {
  .file-browser {
    border-radius: 16px;
    padding: 22px 16px 16px;
    min-height: calc(100vh - 130px);
  }
  .page-header {
    margin-bottom: 23px;
    gap: 17px;
  }
  .heading-copy p {
    font-size: 12px;
  }
  .heading-copy h1 {
    font-size: 24px;
  }
  .page-actions {
    margin-left: 0;
    width: 100%;
    justify-content: flex-start;
  }
  .primary-button,
  .outline-button {
    font-size: 12px;
    min-height: 38px;
    padding-inline: 14px;
  }
  .filters {
    gap: 6px;
  }
  .filter-button {
    font-size: 11px;
    padding: 6px 9px;
  }
  .file-toolbar {
    margin-bottom: 24px;
  }
  .toolbar-options {
    justify-content: space-between;
    width: 100%;
    margin-left: 0;
  }
  .sort-label select {
    padding-left: 0;
    font-size: 11px;
  }
  .view-toggle button {
    height: 30px;
    width: 39px;
  }
  .folder-grid {
    gap: 9px;
    margin-bottom: 27px;
  }
  .folder-card {
    padding: 10px 5px 10px 9px;
    min-height: 58px;
    gap: 0;
  }
  .folder-open {
    gap: 7px;
    font-size: 12px;
  }
  .folder-open > svg {
    width: 20px;
    height: 20px;
  }
  .folder-card .icon-button {
    width: 26px;
    height: 30px;
  }
  .item-checkbox {
    opacity: 1;
    width: 13px !important;
    height: 13px !important;
  }
  .file-table {
    font-size: 11px;
  }
  .file-table td {
    height: 64px;
    padding-right: 5px;
  }
  .file-table th {
    font-size: 11px;
  }
  .date-column {
    display: none;
  }
  .check-column {
    width: 29px;
  }
  .actions-column {
    width: 29px;
  }
  .actions-column .icon-button {
    width: 27px;
  }
  .file-name {
    gap: 8px;
  }
  .file-name-copy strong {
    font-size: 12px;
  }
  .file-name-copy small {
    font-size: 9px;
  }
  .file-icon {
    width: 25px;
  }
  .file-footer {
    align-items: flex-start;
    font-size: 9px;
    line-height: 1.7;
    gap: 8px;
  }
  .file-footer > span:last-child {
    max-width: 55%;
    justify-content: flex-end;
    text-align: right;
  }
  .files-grid {
    gap: 10px;
  }
  .card-preview {
    height: 112px;
  }
  .card-name {
    gap: 5px;
    padding-inline: 1px;
  }
  .card-name strong {
    font-size: 11px;
  }
  .card-name > svg {
    width: 16px;
    height: 16px;
  }
  .card-meta {
    font-size: 8px;
    padding: 7px 10px 12px;
    gap: 5px;
    flex-wrap: wrap;
  }
  .card-top {
    padding-left: 8px;
    font-size: 9px;
    gap: 5px;
  }
  .card-top input {
    width: 12px;
    height: 12px;
  }
  .empty-state {
    padding: 45px 5px 65px;
  }
  .empty-state h2 {
    font-size: 20px;
  }
  .empty-state p {
    font-size: 12px;
  }
  .error-banner {
    gap: 7px;
    padding: 10px;
    flex-wrap: wrap;
  }
  .error-banner button {
    margin-left: auto;
    padding: 4px;
  }
  .upload-notice {
    padding: 11px 10px;
    gap: 8px;
  }
  .upload-notice strong {
    font-size: 11px;
  }
  .upload-notice span {
    font-size: 9px;
  }
  .upload-notice > .upload-notice-icon {
    width: 27px;
  }
  .section-caption h2 {
    font-size: 13px;
  }
  .section-caption > span {
    font-size: 10px;
  }
  .select-all-button {
    font-size: 11px;
  }
  .readonly-label {
    padding: 6px 8px;
  }
  .drop-overlay strong {
    font-size: 20px;
  }
  .selection-bar {
    gap: 5px;
    padding: 4px 6px;
    font-size: 11px;
  }
  .selection-hint {
    font-size: 9px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-row i,
  .skeleton-row span,
  .skeleton-row b {
    animation: none;
  }
  .progress-track > i {
    transition: none;
  }
}
</style>
