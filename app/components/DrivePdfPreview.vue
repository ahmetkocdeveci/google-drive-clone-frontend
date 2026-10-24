<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const props = defineProps<{ src: string; name: string }>()
const emit = defineEmits<{ download: [] }>()
const baseURL = useRuntimeConfig().app.baseURL
const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const loading = ref(true),
  error = ref(''),
  page = ref(1),
  pages = ref(0)
let document: PDFDocumentProxy | undefined
let task: PDFDocumentLoadingTask | undefined
let rendering: RenderTask | undefined
let observer: ResizeObserver | undefined
let revision = 0,
  drawRevision = 0,
  disposed = false
let resizeTimer: ReturnType<typeof setTimeout> | undefined

async function draw() {
  const active = ++drawRevision
  const previous = rendering
  previous?.cancel()
  if (previous) await previous.promise.catch(() => {})
  const pdf = document,
    target = canvas.value
  if (!pdf || !target || disposed || active !== drawRevision) return
  loading.value = true
  try {
    const pdfPage = await pdf.getPage(page.value)
    if (disposed || active !== drawRevision || pdf !== document) return
    const original = pdfPage.getViewport({ scale: 1 })
    const width = Math.max(1, (container.value?.clientWidth || 640) - 24)
    const scale = Math.min(width / original.width, 2)
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(16000000 / (original.width * original.height * scale * scale)),
    )
    const viewport = pdfPage.getViewport({ scale: scale * ratio })
    target.width = Math.max(1, Math.floor(viewport.width))
    target.height = Math.max(1, Math.floor(viewport.height))
    target.style.width = `${viewport.width / ratio}px`
    target.style.height = `${viewport.height / ratio}px`
    const context = target.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    rendering = pdfPage.render({ canvas: target, canvasContext: context, viewport })
    await rendering.promise
    if (active === drawRevision) error.value = ''
  } catch {
    if (!disposed && active === drawRevision)
      error.value = 'PDF sayfası gösterilemedi. Dosyayı indirip açabilirsin.'
  } finally {
    if (!disposed && active === drawRevision) loading.value = false
  }
}

async function load() {
  const active = ++revision
  ++drawRevision
  rendering?.cancel()
  const oldTask = task
  task = undefined
  document = undefined
  await oldTask?.destroy().catch(() => {})
  if (disposed || active !== revision) return
  loading.value = true
  error.value = ''
  page.value = 1
  pages.value = 0
  try {
    // Only the authenticated download's local blob is accepted. PDF actions,
    // embedded HTML, links and document JavaScript are never mounted/executed.
    const url = new URL(props.src)
    if (url.protocol !== 'blob:' || url.origin !== window.location.origin)
      throw new Error('Invalid preview URL')
    const pdfjs = await import('pdfjs-dist')
    if (disposed || active !== revision) return
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const assets = new URL(`${baseURL}pdf-assets/`, window.location.origin).href
    const current = pdfjs.getDocument({
      url: url.href,
      enableXfa: false,
      useWorkerFetch: true,
      cMapUrl: `${assets}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assets}standard_fonts/`,
      wasmUrl: `${assets}wasm/`,
    })
    task = current
    current.onPassword = () => {
      if (active === revision && !disposed) {
        error.value = 'Bu PDF parola istiyor. Dosyayı indirip cihazında açabilirsin.'
        loading.value = false
      }
      void current.destroy().catch(() => {})
    }
    const pdf = await current.promise
    if (disposed || active !== revision) return
    document = pdf
    pages.value = pdf.numPages
    await nextTick()
    await draw()
  } catch {
    if (!disposed && active === revision) {
      error.value ||= 'PDF önizlemesi açılamadı. Dosyayı indirip açabilirsin.'
      loading.value = false
    }
  }
}

onMounted(() => {
  observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (document && !error.value) void draw()
    }, 100)
  })
  if (container.value) observer.observe(container.value)
  void load()
})
watch(
  () => props.src,
  () => {
    void load()
  },
)
watch(page, () => {
  if (document) void draw()
})
onBeforeUnmount(() => {
  disposed = true
  ++revision
  ++drawRevision
  clearTimeout(resizeTimer)
  observer?.disconnect()
  rendering?.cancel()
  void task?.destroy().catch(() => {})
  document = undefined
  if (canvas.value) {
    canvas.value.width = 0
    canvas.value.height = 0
  }
})
</script>

<template>
  <section
    ref="container"
    class="pdf-viewer"
    :aria-label="`${name} PDF önizlemesi`"
    :aria-busy="loading"
  >
    <nav v-if="pages && !error" class="pdf-toolbar" aria-label="PDF sayfaları">
      <button
        type="button"
        :disabled="page <= 1 || loading"
        aria-label="Önceki PDF sayfası"
        @click="page--"
      >
        ← Önceki
      </button>
      <span aria-live="polite">{{ page }} / {{ pages }}</span>
      <button
        type="button"
        :disabled="page >= pages || loading"
        aria-label="Sonraki PDF sayfası"
        @click="page++"
      >
        Sonraki →
      </button>
    </nav>
    <p v-if="loading" role="status">PDF hazırlanıyor…</p>
    <div v-if="error" class="pdf-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="emit('download')">Dosyayı indir</button>
    </div>
    <div v-show="!error" class="pdf-page">
      <canvas ref="canvas" role="img" :aria-label="`${name}, sayfa ${page}`" />
    </div>
  </section>
</template>

<style scoped>
.pdf-viewer {
  width: 100%;
  min-width: 0;
  max-height: calc(100dvh - 250px);
  min-height: 360px;
  overflow: auto;
  text-align: center;
  align-self: flex-start;
}
.pdf-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  position: sticky;
  top: 0;
  background: #f1f4f9;
  padding: 8px 4px;
  z-index: 1;
  font-size: 12px;
}
.pdf-viewer button {
  border: 1px solid #c7d4e5;
  background: #fff;
  color: #0b57d0;
  border-radius: 18px;
  padding: 8px 12px;
  cursor: pointer;
  font: inherit;
}
.pdf-viewer button:disabled {
  opacity: 0.45;
  cursor: default;
}
.pdf-viewer button:focus-visible {
  outline: 2px solid #0b57d0;
  outline-offset: 2px;
}
.pdf-page {
  display: flex;
  justify-content: center;
  padding: 12px;
}
.pdf-page canvas {
  display: block;
  background: #fff;
  box-shadow: 0 2px 15px #2a43681a;
  max-width: 100%;
  height: auto !important;
}
.pdf-error {
  padding: 32px 16px;
  color: #854238;
  font-size: 13px;
  line-height: 1.8;
}
@media (max-width: 640px) {
  .pdf-viewer {
    max-height: 53dvh;
    min-height: 300px;
  }
  .pdf-toolbar {
    gap: 8px;
  }
}
</style>
