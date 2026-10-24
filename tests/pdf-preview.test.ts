import test from 'node:test'
import assert from 'node:assert/strict'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createPreviewPdf } from './fixtures/preview-pdf.ts'

test('PDF renderer draws distinct pages without the browser PDF plugin', async () => {
  const task = getDocument({
    data: createPreviewPdf(),
    enableXfa: false,
    useWasm: false,
    useWorkerFetch: false,
  })
  try {
    const pdf = await task.promise
    assert.equal(pdf.numPages, 2)
    const factory = pdf.canvasFactory as {
      create(
        width: number,
        height: number,
      ): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }
      destroy(target: unknown): void
    }
    for (const [number, color] of [
      [1, [255, 0, 0, 255]],
      [2, [0, 0, 255, 255]],
    ] as const) {
      const page = await pdf.getPage(number)
      const viewport = page.getViewport({ scale: 1 })
      const target = factory.create(viewport.width, viewport.height)
      try {
        await page.render({ canvas: target.canvas, canvasContext: target.context, viewport })
          .promise
        assert.deepEqual(Array.from(target.context.getImageData(20, 20, 1, 1).data), color)
      } finally {
        factory.destroy(target)
      }
    }
  } finally {
    await task.destroy()
  }
})

test('invalid PDF content rejects instead of displaying uploaded markup', async () => {
  const task = getDocument({
    data: new TextEncoder().encode('<html><script>alert(1)</script></html>'),
    verbosity: 0,
  })
  try {
    await assert.rejects(task.promise, { name: 'InvalidPDFException' })
  } finally {
    await task.destroy()
  }
})
