import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export function reviewAudit(report) {
  if (
    !report ||
    typeof report.advisories !== 'object' ||
    Array.isArray(report.advisories) ||
    !report.advisories ||
    report.error ||
    !report.metadata?.vulnerabilities ||
    Array.isArray(report.metadata.vulnerabilities)
  )
    throw new Error('Invalid dependency audit response.')
  const advisories = Object.values(report.advisories)
  const reportedCount = ['info', 'low', 'moderate', 'high', 'critical'].reduce((sum, level) => {
    const count = report.metadata.vulnerabilities[level]
    if (!Number.isInteger(count) || count < 0) throw new Error('Invalid vulnerability count.')
    return sum + count
  }, 0)
  if (reportedCount !== advisories.length) throw new Error('Incomplete dependency audit response.')
  if (reportedCount !== 0)
    throw new Error('Dependency vulnerabilities found; no audit exceptions are allowed.')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packageManager = process.env.npm_execpath
  if (!packageManager) throw new Error('Run this check through pnpm check:dependencies.')
  const runtime = spawnSync(process.execPath, ['scripts/check-runtime.mjs'], { stdio: 'inherit' })
  if (runtime.status !== 0) throw new Error('Production runtime boundary was not verified.')
  const audit = spawnSync(process.execPath, [packageManager, 'audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (audit.error || ![0, 1].includes(audit.status))
    throw new Error('Dependency audit failed to run.')
  reviewAudit(JSON.parse(audit.stdout))
  if (audit.status !== 0) throw new Error('Dependency audit did not complete successfully.')
  console.log(
    'No dependency advisories reported (including development dependencies; no exceptions).',
  )
}
