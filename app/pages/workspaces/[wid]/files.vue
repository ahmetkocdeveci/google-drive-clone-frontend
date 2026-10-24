<script setup lang="ts">
import type { ArchiveJob, ContentDownload, DriveNode, NodeQuery } from '../../../../shared/types'
import { getFolderPath } from '~/services/folder-path'
import { uploadFolderSelection, type FolderSelection } from '~/services/folder-upload'
import { createNodeLocation } from '~/services/node-location'
definePageMeta({ layout: 'workspace', middleware: ['workspace'] })
const drive = useDrive(),
  route = useRoute(),
  router = useRouter()
const { notify } = useNotify()
const location = createNodeLocation(drive.api)
const wid = computed(() => String(route.params.wid || ''))
const workspace = computed(() => drive.currentWorkspace.value)
const canWrite = computed(
  () =>
    workspace.value?.id === wid.value && workspace.value.capabilities.includes('content:create'),
)
const parent = computed(() => (typeof route.query.folder === 'string' ? route.query.folder : null))
const recent = computed(() => route.query.recent === '1')
const nodes = ref<DriveNode[]>([]),
  breadcrumbs = ref<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'Tüm dosyalar' },
  ])
const loading = ref(true),
  error = ref(''),
  view = ref<'list' | 'grid'>('list'),
  filter = ref<'all' | 'documents' | 'images'>('all'),
  sort = ref<'updatedAt' | 'name' | 'size'>('updatedAt')
const nextCursor = ref<string | null>(null),
  loadingMore = ref(false)
const uploading = ref(false),
  uploadProgress = ref(0),
  fileInput = ref<HTMLInputElement>()
const detail = ref<DriveNode | null>(null),
  previewUrl = ref<string | null>(null),
  previewLoading = ref(false),
  previewError = ref('')
const editing = ref<'folder' | 'rename' | 'move' | 'delete' | null>(null),
  target = ref<DriveNode | null>(null),
  deleting = ref<DriveNode[]>([]),
  inputName = ref(''),
  moveParent = ref('root'),
  moveFolders = ref<DriveNode[]>([]),
  formError = ref(''),
  pending = ref(false),
  foldersLoading = ref(false)
const movePath = ref<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'Çalışma alanı kökü' },
  ]),
  moveReady = ref(false)
const moveCursor = ref<string | null>(null),
  moveLoadingMore = ref(false)
type ArchiveTask = {
  key: string
  node: DriveNode
  job: ArchiveJob | null
  state: 'preparing' | 'downloading' | 'cancelling' | 'done' | 'failed' | 'cancelled'
  error: string
}
const archiveTasks = ref<ArchiveTask[]>([]),
  archiveControllers = new Map<string, AbortController>()
const title = computed(() =>
  recent.value
    ? 'Son kullanılanlar'
    : drive.search.value.trim()
      ? 'Arama sonuçları'
      : breadcrumbs.value.at(-1)?.name === 'Tüm dosyalar'
        ? 'Dosyalar'
        : breadcrumbs.value.at(-1)?.name || 'Dosyalar',
)
const subtitle = computed(() =>
  recent.value
    ? 'Çalışma alanında en son güncellenen dosyalar.'
    : drive.search.value.trim()
      ? `“${drive.search.value}” için bu çalışma alanında arama yapılıyor.`
      : 'Dosya ve klasörlerin, ekibinle bir arada.',
)
let disposed = false,
  generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined,
  pageController: AbortController | undefined,
  mutationController: AbortController | undefined,
  uploadController: AbortController | undefined,
  previewController: AbortController | undefined,
  moveController: AbortController | undefined
const downloads = new Set<AbortController>()
let moveRevision = 0
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'İşlem tamamlanamadı. Yeniden dene.'
const aborted = (cause: unknown) => (cause as { name?: string })?.name === 'AbortError'
function nodeQuery(): NodeQuery {
  return {
    parentId: parent.value,
    search: drive.search.value.trim(),
    type: filter.value === 'images' ? 'image' : filter.value === 'documents' ? 'document' : 'all',
    sort: sort.value,
    direction: sort.value === 'name' ? 'asc' : 'desc',
    recent: recent.value,
  }
}

async function load() {
  controller?.abort()
  pageController?.abort()
  controller = new AbortController()
  const signal = controller.signal,
    revision = ++generation,
    scope = wid.value
  loading.value = true
  loadingMore.value = false
  nextCursor.value = null
  error.value = ''
  nodes.value = []
  try {
    const chain: Array<{ id: string | null; name: string }> = [{ id: null, name: 'Tüm dosyalar' }]
    if (!recent.value)
      chain.push(
        ...(await getFolderPath(drive.api, scope, parent.value, { signal })).map((folder) => ({
          id: folder.id,
          name: folder.name,
        })),
      )
    const result = await drive.api.listNodesPage(scope, { ...nodeQuery(), limit: 100 }, { signal })
    if (disposed || revision !== generation || scope !== wid.value) return
    breadcrumbs.value = chain
    nodes.value = result.items
    nextCursor.value = result.nextCursor
  } catch (cause) {
    if (!disposed && revision === generation && !aborted(cause)) {
      error.value = message(cause)
      breadcrumbs.value = [{ id: null, name: 'Tüm dosyalar' }]
    }
  } finally {
    if (!disposed && revision === generation) loading.value = false
  }
}
async function loadMore() {
  if (!nextCursor.value || loadingMore.value || loading.value) return
  pageController?.abort()
  pageController = new AbortController()
  const revision = generation,
    scope = wid.value,
    cursor = nextCursor.value
  loadingMore.value = true
  error.value = ''
  try {
    const page = await drive.api.listNodesPage(
      scope,
      { ...nodeQuery(), limit: 100, cursor },
      { signal: pageController.signal },
    )
    if (disposed || revision !== generation || scope !== wid.value) return
    nodes.value = [
      ...new Map([...nodes.value, ...page.items].map((node) => [node.id, node])).values(),
    ]
    nextCursor.value = page.nextCursor
  } catch (cause) {
    if (!disposed && revision === generation && !aborted(cause)) {
      error.value = message(cause)
      if ((cause as { status?: number }).status === 409) nextCursor.value = null
    }
  } finally {
    if (!disposed && revision === generation) loadingMore.value = false
  }
}
async function navigate(folderId: string | null) {
  drive.search.value = ''
  await router.push({ path: route.path, query: folderId ? { folder: folderId } : {} })
}
function closeDetail() {
  previewController?.abort()
  location.clear()
  detail.value = null
  previewLoading.value = false
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
  previewError.value = ''
}
async function preview(node: DriveNode) {
  closeDetail()
  detail.value = node
  void location.load(wid.value, node)
  if (
    node.kind !== 'file' ||
    !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(
      node.mimeType,
    )
  )
    return
  previewController = new AbortController()
  const signal = previewController.signal
  previewLoading.value = true
  try {
    const result = await drive.api.getContent(wid.value, node.id, { signal })
    if (!signal.aborted && !disposed && detail.value?.id === node.id)
      previewUrl.value = URL.createObjectURL(result.blob)
  } catch (cause) {
    if (!aborted(cause) && !disposed && detail.value?.id === node.id)
      previewError.value = message(cause)
  } finally {
    if (!signal.aborted && !disposed) previewLoading.value = false
  }
}
function saveContent(content: ContentDownload, fallback: string) {
  const url = URL.createObjectURL(content.blob),
    link = document.createElement('a')
  link.href = url
  link.download = (
    content.filename && content.filename !== 'dosya' ? content.filename : fallback
  ).replace(/[\\/\u0000-\u001f]/g, '_')
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
async function download(node: DriveNode) {
  if (node.kind === 'folder') {
    closeDetail()
    await startArchive(node)
    return
  }
  const controller = new AbortController()
  downloads.add(controller)
  try {
    const content = await drive.api.getContent(wid.value, node.id, { signal: controller.signal })
    if (!disposed) saveContent(content, node.name)
  } catch (cause) {
    if (!disposed && !aborted(cause)) notify(message(cause), 'error')
  } finally {
    downloads.delete(controller)
  }
}
async function startArchive(node: DriveNode) {
  if (
    archiveTasks.value.some(
      (task) =>
        task.node.id === node.id && ['preparing', 'downloading', 'cancelling'].includes(task.state),
    )
  )
    return
  const task = reactive<ArchiveTask>({
    key: crypto.randomUUID(),
    node,
    job: null,
    state: 'preparing',
    error: '',
  })
  const controller = new AbortController()
  downloads.add(controller)
  archiveControllers.set(task.key, controller)
  archiveTasks.value.push(task)
  try {
    const result = await drive.api.downloadFolder(wid.value, node.id, {
      signal: controller.signal,
      onProgress: (job) => {
        if (!disposed && task.state !== 'cancelling') {
          task.job = job
          task.state = job.status === 'ready' ? 'downloading' : 'preparing'
        }
      },
    })
    if (!disposed) {
      task.state = 'done'
      saveContent(result, node.name + '.zip')
    }
  } catch (cause) {
    if (!disposed) {
      task.state = aborted(cause) ? 'cancelled' : 'failed'
      task.error = aborted(cause) ? '' : message(cause)
    }
  } finally {
    downloads.delete(controller)
    archiveControllers.delete(task.key)
  }
}
function cancelArchive(task: ArchiveTask) {
  task.state = 'cancelling'
  archiveControllers.get(task.key)?.abort()
}
function dismissArchive(task: ArchiveTask) {
  archiveTasks.value = archiveTasks.value.filter((item) => item.key !== task.key)
}
function retryArchive(task: ArchiveTask) {
  dismissArchive(task)
  void startArchive(task.node)
}
function openFolder() {
  if (!canWrite.value) return
  closeDetail()
  inputName.value = ''
  formError.value = ''
  editing.value = 'folder'
}
function rename(node: DriveNode) {
  if (!canWrite.value) return
  closeDetail()
  target.value = node
  inputName.value = node.name
  formError.value = ''
  editing.value = 'rename'
}
function remove(items: DriveNode[]) {
  if (!canWrite.value || !items.length) return
  closeDetail()
  deleting.value = items
  formError.value = ''
  editing.value = 'delete'
}
async function move(node: DriveNode) {
  if (!canWrite.value) return
  closeDetail()
  target.value = node
  moveParent.value = node.parentId || 'root'
  formError.value = ''
  moveFolders.value = []
  editing.value = 'move'
  await browseMove(node.parentId)
}
async function browseMove(folderId: string | null) {
  moveController?.abort()
  moveController = new AbortController()
  const signal = moveController.signal,
    revision = ++moveRevision,
    scope = wid.value,
    movingId = target.value?.id
  foldersLoading.value = true
  moveLoadingMore.value = false
  moveCursor.value = null
  moveReady.value = false
  formError.value = ''
  moveFolders.value = []
  try {
    const path = await getFolderPath(drive.api, scope, folderId, { signal })
    if (path.some((folder) => folder.id === movingId))
      throw new Error('Klasör kendi içine veya alt klasörüne taşınamaz.')
    const folders = await drive.api.listNodesPage(
      scope,
      { parentId: folderId, type: 'folder', sort: 'name', direction: 'asc', limit: 100 },
      { signal },
    )
    if (
      disposed ||
      revision !== moveRevision ||
      scope !== wid.value ||
      editing.value !== 'move' ||
      movingId !== target.value?.id
    )
      return
    movePath.value = [
      { id: null, name: 'Çalışma alanı kökü' },
      ...path.map((folder) => ({ id: folder.id, name: folder.name })),
    ]
    moveFolders.value = folders.items.filter(
      (folder) => folder.kind === 'folder' && folder.id !== movingId,
    )
    moveCursor.value = folders.nextCursor
    moveParent.value = folderId || 'root'
    moveReady.value = true
  } catch (cause) {
    if (!disposed && revision === moveRevision && !aborted(cause)) formError.value = message(cause)
  } finally {
    if (!disposed && revision === moveRevision) foldersLoading.value = false
  }
}
async function moreMoveFolders() {
  if (!moveCursor.value || moveLoadingMore.value || foldersLoading.value) return
  const revision = moveRevision,
    scope = wid.value,
    movingId = target.value?.id,
    cursor = moveCursor.value
  moveLoadingMore.value = true
  formError.value = ''
  try {
    const page = await drive.api.listNodesPage(
      scope,
      {
        parentId: moveParent.value === 'root' ? null : moveParent.value,
        type: 'folder',
        sort: 'name',
        direction: 'asc',
        limit: 100,
        cursor,
      },
      { signal: moveController?.signal },
    )
    if (
      disposed ||
      revision !== moveRevision ||
      editing.value !== 'move' ||
      movingId !== target.value?.id
    )
      return
    moveFolders.value = [
      ...new Map(
        [...moveFolders.value, ...page.items.filter((folder) => folder.id !== movingId)].map(
          (folder) => [folder.id, folder],
        ),
      ).values(),
    ]
    moveCursor.value = page.nextCursor
  } catch (cause) {
    if (!disposed && revision === moveRevision && !aborted(cause)) {
      formError.value = message(cause)
      if ((cause as { status?: number }).status === 409) moveCursor.value = null
    }
  } finally {
    if (!disposed && revision === moveRevision) moveLoadingMore.value = false
  }
}
async function refreshMetadata(scope: string) {
  try {
    const updated = await drive.api.getWorkspace(scope)
    if (!disposed && drive.currentWorkspace.value?.id === scope)
      drive.currentWorkspace.value = updated
  } catch {
    /* A failed list refresh is shown by load(). */
  }
}
async function submit() {
  if (!canWrite.value || pending.value || (editing.value === 'move' && !moveReady.value)) return
  if (editing.value !== 'delete' && editing.value !== 'move' && !inputName.value.trim()) {
    formError.value = 'Bir ad yaz.'
    return
  }
  pending.value = true
  formError.value = ''
  const scope = wid.value
  mutationController = new AbortController()
  const options = { signal: mutationController.signal }
  try {
    if (editing.value === 'folder')
      await drive.api.createFolder(
        scope,
        { name: inputName.value.trim(), parentId: parent.value },
        options,
      )
    else if (editing.value === 'rename' && target.value)
      await drive.api.updateNode(
        scope,
        target.value.id,
        { name: inputName.value.trim(), version: target.value.version },
        options,
      )
    else if (editing.value === 'move' && target.value)
      await drive.api.updateNode(
        scope,
        target.value.id,
        {
          parentId: moveParent.value === 'root' ? null : moveParent.value,
          version: target.value.version,
        },
        options,
      )
    else if (editing.value === 'delete')
      await drive.api.deleteNodes(
        scope,
        deleting.value.map((item) => item.id),
        options,
      )
    if (!disposed) {
      editing.value = null
      notify('Değişiklik kaydedildi.')
    }
  } catch (cause) {
    if (!disposed && !aborted(cause)) formError.value = message(cause)
  } finally {
    if (!disposed) {
      pending.value = false
      await Promise.all([load(), refreshMetadata(scope)])
    }
  }
}
async function upload(files: File[]) {
  if (disposed || !canWrite.value || uploading.value || !files.length) return
  const scope = wid.value
  uploading.value = true
  uploadProgress.value = 0
  uploadController = new AbortController()
  try {
    await drive.api.uploadFiles(
      scope,
      parent.value,
      files,
      (progress) => {
        if (!disposed) uploadProgress.value = progress.percent
      },
      { signal: uploadController.signal },
    )
    if (!disposed) notify(`${files.length} dosya yüklendi.`)
  } catch (cause) {
    if (!disposed && !aborted(cause))
      notify(message(cause) + ' Tamamlanan dosyalar listede görünecek.', 'error')
  } finally {
    if (!disposed) {
      uploading.value = false
      await Promise.all([load(), refreshMetadata(scope)])
    }
  }
}
async function uploadTree(selection: FolderSelection) {
  if (
    disposed ||
    !canWrite.value ||
    uploading.value ||
    (!selection.files.length && !selection.directories.length)
  )
    return
  const scope = wid.value,
    destination = parent.value
  uploading.value = true
  uploadProgress.value = 0
  uploadController = new AbortController()
  try {
    await uploadFolderSelection(
      drive.api,
      scope,
      destination,
      selection,
      (percent) => {
        if (!disposed) uploadProgress.value = percent
      },
      { signal: uploadController.signal },
    )
    if (!disposed) notify('Klasör yapısı ve dosyalar yüklendi.')
  } catch (cause) {
    if (!disposed && !aborted(cause))
      notify(
        message(cause) +
          ' Tamamlanan öğeler listede görünecek; tekrar yükleme yeni bir klasör oluşturur.',
        'error',
      )
  } finally {
    if (!disposed) {
      uploading.value = false
      await Promise.all([load(), refreshMetadata(scope)])
    }
  }
}
function openLocation(folderId: string | null) {
  closeDetail()
  void navigate(folderId)
}
function chooseFiles(event: Event) {
  const input = event.target as HTMLInputElement
  void upload(Array.from(input.files || []))
  input.value = ''
}
watch([parent, recent, filter, sort], () => {
  closeDetail()
  void load()
})
watch(
  () => drive.search.value,
  () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void load()
    }, 250)
  },
)
watch(
  () => drive.command.value,
  async (command) => {
    if (!command) return
    drive.command.value = null
    await nextTick()
    if (command === 'folder') openFolder()
    else if (canWrite.value) fileInput.value?.click()
  },
  { immediate: true },
)
onMounted(load)
watch(editing, (value) => {
  if (value !== 'move') {
    moveRevision++
    moveController?.abort()
    moveReady.value = false
  }
})
onBeforeUnmount(() => {
  disposed = true
  generation++
  moveRevision++
  clearTimeout(timer)
  controller?.abort()
  pageController?.abort()
  mutationController?.abort()
  uploadController?.abort()
  moveController?.abort()
  for (const download of downloads) download.abort()
  closeDetail()
})
useHead({ title: computed(() => `${title.value} · Ortak Drive`) })
</script>
<template>
  <div>
    <input
      ref="fileInput"
      type="file"
      multiple
      hidden
      :disabled="!canWrite || uploading"
      aria-label="Yüklenecek dosyalar"
      @change="chooseFiles"
    />
    <section v-if="archiveTasks.length" class="archive-panel" aria-label="Klasör indirmeleri">
      <article v-for="task in archiveTasks" :key="task.key" class="archive-task">
        <div>
          <strong>{{ task.node.name }} · ZIP</strong>
          <p role="status">
            {{
              task.state === 'preparing'
                ? 'Arşiv hazırlanıyor…'
                : task.state === 'downloading'
                  ? 'Arşiv indiriliyor…'
                  : task.state === 'cancelling'
                    ? 'İptal ediliyor…'
                    : task.state === 'done'
                      ? 'İndirme başlatıldı.'
                      : task.state === 'cancelled'
                        ? 'İşlem iptal edildi.'
                        : 'Arşiv hazırlanamadı.'
            }}
          </p>
          <small v-if="task.job && ['preparing', 'downloading'].includes(task.state)"
            >{{ task.job.processedFiles
            }}{{ task.job.totalFiles !== undefined ? ' / ' + task.job.totalFiles : '' }} dosya
            hazırlandı</small
          ><progress
            v-if="task.job?.totalFiles"
            :value="task.job.processedFiles"
            :max="task.job.totalFiles"
            aria-label="Arşiv hazırlama ilerlemesi"
          />
          <p v-if="task.error" class="form-error" role="alert">{{ task.error }}</p>
        </div>
        <button
          v-if="['preparing', 'downloading'].includes(task.state)"
          type="button"
          class="btn btn-secondary"
          @click="cancelArchive(task)"
        >
          İptal et</button
        ><template v-else-if="task.state !== 'cancelling'"
          ><button
            v-if="task.state === 'failed' || task.state === 'cancelled'"
            class="btn btn-secondary"
            type="button"
            @click="retryArchive(task)"
          >
            Yeniden dene</button
          ><button
            class="icon-btn"
            type="button"
            aria-label="İndirme durumunu kapat"
            @click="dismissArchive(task)"
          >
            <AppIcon name="close" /></button
        ></template>
      </article>
    </section>
    <DriveFileBrowser
      :nodes="nodes"
      :loading="loading"
      :error="error"
      :can-write="canWrite"
      :breadcrumbs="breadcrumbs"
      :title="title"
      :subtitle="subtitle"
      :view="view"
      :query="drive.search.value"
      :filter="filter"
      :sort="sort"
      :recent="recent"
      :uploading="uploading"
      :upload-progress="uploadProgress"
      :has-more="!!nextCursor"
      :loading-more="loadingMore"
      @open="(node) => navigate(node.id)"
      @preview="preview"
      @download="download"
      @rename="rename"
      @move="move"
      @delete="remove"
      @upload="upload"
      @upload-tree="uploadTree"
      @upload-error="notify($event, 'error')"
      @create-folder="openFolder"
      @navigate="navigate"
      @search="drive.search.value = $event"
      @filter="filter = $event"
      @sort="sort = $event"
      @view-change="view = $event"
      @refresh="load"
      @load-more="loadMore"
    /><DriveFileDetail
      :location-path="location.path.value"
      :location-loading="location.loading.value"
      :location-error="location.error.value"
      @open-location="openLocation"
      :node="detail"
      :preview-url="previewUrl"
      :loading="previewLoading"
      :error="previewError"
      :can-write="canWrite"
      @close="closeDetail"
      @download="download"
      @rename="rename"
      @delete="remove"
    /><AppModal
      :open="!!editing"
      :title="
        editing === 'folder'
          ? 'Yeni klasör'
          : editing === 'rename'
            ? 'Adını değiştir'
            : editing === 'move'
              ? 'Başka klasöre taşı'
              : 'Seçili içerikleri sil'
      "
      :busy="pending"
      @close="editing = null"
      ><form @submit.prevent="submit">
        <template v-if="editing === 'folder' || editing === 'rename'"
          ><div class="form-field">
            <label for="node-name">{{ editing === 'folder' ? 'Klasör adı' : 'Yeni ad' }}</label
            ><input
              id="node-name"
              v-model="inputName"
              class="form-input"
              required
              maxlength="180"
              autofocus
              :disabled="pending"
            /></div></template
        ><template v-else-if="editing === 'move'"
          ><p class="muted move-hint">
            {{ target?.name }} için hedef klasör seç. Bir klasör kendi altına taşınamaz.
          </p>
          <nav class="move-breadcrumbs" aria-label="Hedef klasör yolu">
            <button
              v-for="(folder, index) in movePath"
              :key="folder.id || 'root'"
              type="button"
              :disabled="pending || foldersLoading"
              :aria-current="index === movePath.length - 1 ? 'location' : undefined"
              @click="browseMove(folder.id)"
            >
              {{ folder.name
              }}<AppIcon v-if="index < movePath.length - 1" name="arrow-right" :size="13" />
            </button>
          </nav>
          <p v-if="foldersLoading" class="muted" role="status">Klasörler yükleniyor…</p>
          <ul v-else class="move-folders" aria-label="Hedefteki klasörler">
            <li v-for="folder in moveFolders" :key="folder.id">
              <button type="button" :disabled="pending" @click="browseMove(folder.id)">
                <AppIcon name="folder" :size="20" /><span>{{ folder.name }}</span
                ><AppIcon name="arrow-right" :size="15" />
              </button>
            </li>
            <li v-if="moveReady && !moveFolders.length" class="move-empty">
              Bu konumda başka alt klasör bulunmuyor.
            </li>
          </ul>
          <button
            v-if="moveCursor"
            type="button"
            class="btn btn-secondary"
            :disabled="moveLoadingMore || foldersLoading || pending"
            @click="moreMoveFolders"
          >
            {{ moveLoadingMore ? 'Yükleniyor…' : 'Daha fazla klasör' }}
          </button>
          <p v-if="moveReady" class="muted move-destination">
            Seçilen hedef: <strong>{{ movePath.at(-1)?.name }}</strong>
          </p></template
        ><template v-else
          ><p class="delete-explanation">
            {{ deleting.length === 1 ? deleting[0]?.name : `${deleting.length} seçili içerik` }}
            çalışma alanından silinecek. Klasörlerin içindeki dosyalar da kaldırılır.
          </p>
          <p class="muted move-hint">Bu işlem geri alınamaz.</p></template
        >
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <div class="form-actions">
          <button
            class="btn btn-secondary"
            type="button"
            :disabled="pending"
            @click="editing = null"
          >
            Vazgeç</button
          ><button
            class="btn"
            :class="editing === 'delete' ? 'btn-danger' : 'btn-primary'"
            type="submit"
            :disabled="pending || foldersLoading || (editing === 'move' && !moveReady)"
          >
            {{
              pending
                ? 'Kaydediliyor…'
                : editing === 'delete'
                  ? 'Sil'
                  : editing === 'folder'
                    ? 'Klasör oluştur'
                    : editing === 'move'
                      ? 'Buraya taşı'
                      : 'Kaydet'
            }}
          </button>
        </div>
      </form></AppModal
    >
  </div>
</template>
<style scoped>
.archive-panel {
  margin-bottom: 22px;
  display: grid;
  gap: 10px;
}
.archive-task {
  display: flex;
  gap: 13px;
  align-items: center;
  background: #edf4ff;
  border: 1px solid #d8e7ff;
  border-radius: 12px;
  padding: 16px;
}
.archive-task > div {
  flex: 1;
  min-width: 0;
}
.archive-task strong {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.archive-task p {
  font-size: 12px;
  line-height: 1.6;
  margin: 7px 0;
}
.archive-task small {
  font-size: 11px;
  color: var(--muted);
}
.archive-task progress {
  display: block;
  width: 100%;
  margin-top: 10px;
}
.archive-task > .btn {
  flex: none;
}
.archive-task .form-error {
  margin-bottom: 0;
}
@media (max-width: 560px) {
  .archive-task {
    flex-wrap: wrap;
  }
  .archive-task > div {
    flex-basis: 100%;
  }
}
.move-hint {
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 22px;
}
.delete-explanation {
  font-size: 14px;
  line-height: 1.8;
  margin: 0 0 12px;
}
.move-breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 0 14px;
}
.move-breadcrumbs button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 7px;
  background: #edf3fc;
  border-radius: 5px;
  color: var(--accent);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.move-breadcrumbs button[aria-current='location'] {
  color: var(--text);
  font-weight: 600;
}
.move-folders {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 9px;
}
.move-folders button {
  display: flex;
  width: 100%;
  gap: 10px;
  align-items: center;
  padding: 13px;
  text-align: left;
  background: white;
  color: var(--text);
  font-size: 13px;
}
.move-folders button:hover {
  background: #f1f5fc;
}
.move-folders button > span {
  flex: 1;
  overflow-wrap: anywhere;
}
.move-empty {
  padding: 16px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.move-destination {
  font-size: 12px;
  margin: 0 0 20px;
  overflow-wrap: anywhere;
}
</style>
