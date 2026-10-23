import { spawnSync } from 'node:child_process'
import { access, readFile, unlink, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/nuxt/bin/nuxt.mjs'), 'generate'], {
  cwd: root,
  env: { ...process.env, DRIVE_PAGES_BUILD: '1', NUXT_PUBLIC_DATA_MODE: 'http', NUXT_PUBLIC_API_BASE: '/api/v1' },
  stdio: 'inherit', shell: false,
})
if (result.error || result.status !== 0) process.exit(result.status || 1)
const output = path.join(root, '.pages-output/public')
if (await realpath(output) !== output) throw new Error('Unexpected Pages output directory')
// Without a top-level 404 file, Pages serves existing assets and falls back to index for SPA routes.
await unlink(path.join(output, '404.html')).catch(error => { if (error.code !== 'ENOENT') throw error })
await access(path.join(output, 'index.html'))
for (const asset of ['pdf-assets/cmaps', 'pdf-assets/standard_fonts', 'pdf-assets/wasm', '_headers']) await access(path.join(output, asset))
const routes = JSON.parse(await readFile(path.join(output, '_routes.json'), 'utf8'))
if (routes.version !== 1 || JSON.stringify(routes.include) !== '["/api/*"]' || routes.exclude.length) throw new Error('Unexpected API function routes')
await access(path.join(root, 'functions/api/[[path]].js'))
console.log('Cloudflare Pages artifact checked: SPA, PDF assets and API function routes ready. No deployment performed.')
