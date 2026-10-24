import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stat, readFile } from 'node:fs/promises'

const root = fileURLToPath(new URL('../.output/public/', import.meta.url))
const port = Number(process.env.PORT || 4179)
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}
try {
  await stat(path.join(root, 'index.html'))
} catch {
  console.error('Önce pnpm generate çalıştır.')
  process.exit(1)
}
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname)
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      return response.end(
        JSON.stringify({
          error: {
            code: 'BACKEND_NOT_CONNECTED',
            message: 'Bu önizlemede gerçek backend bağlı değil.',
          },
        }),
      )
    }
    if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
      response.writeHead(405)
      return response.end()
    }
    let target = path.resolve(root, '.' + pathname)
    if (target !== path.resolve(root) && !target.startsWith(path.resolve(root) + path.sep)) {
      response.writeHead(403)
      return response.end()
    }
    try {
      const info = await stat(target)
      if (info.isDirectory()) target = path.join(target, 'index.html')
      await stat(target)
    } catch {
      if (path.extname(pathname) || pathname.startsWith('/_nuxt/')) {
        response.writeHead(404)
        return response.end('Bulunamadı')
      }
      target = path.join(root, 'index.html')
    }
    const body = await readFile(target)
    response.writeHead(200, {
      'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch {
    response.writeHead(400)
    response.end('Geçersiz istek')
  }
})
server.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`))
