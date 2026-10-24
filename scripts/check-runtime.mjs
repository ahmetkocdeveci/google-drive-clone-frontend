import { readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

const root = await realpath('.output/server'),
  visited = new Set(),
  blocked = new Set(['node-forge', 'braces'])
let inspected = 0
async function walk(directory) {
  const resolved = await realpath(directory)
  if (resolved !== root && !resolved.startsWith(root + path.sep))
    throw new Error('Runtime dependency points outside the deployable output.')
  if (visited.has(resolved)) return
  visited.add(resolved)
  for (const entry of await readdir(resolved, { withFileTypes: true })) {
    const file = path.join(resolved, entry.name)
    if (entry.isDirectory()) await walk(file)
    else if (entry.isSymbolicLink()) {
      // Nitro can emit package links; inspect their resolved directory as well.
      const target = await realpath(file)
      const { stat } = await import('node:fs/promises')
      if ((await stat(target)).isDirectory()) await walk(target)
    } else if (entry.name === 'package.json') {
      const manifest = JSON.parse(await readFile(file, 'utf8'))
      inspected++
      for (const name of [
        manifest.name,
        ...Object.keys(manifest.dependencies || {}),
        ...Object.keys(manifest.optionalDependencies || {}),
      ])
        if (blocked.has(name))
          throw new Error(`Known vulnerable build dependency entered production output: ${name}`)
    }
  }
}
await walk(root)
console.log(
  `Runtime dependency boundary passed (${inspected} manifests). Build/development advisory findings remain tracked separately.`,
)
