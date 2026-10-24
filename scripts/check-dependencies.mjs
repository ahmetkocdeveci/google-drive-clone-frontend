import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const knownAdvisory = 'GHSA-86w9-cpqp-85rv'
const buildOnlyPath = '.>nuxt>@nuxt/nitro-server>nitropack>listhen>node-forge'

// This exception covers one unpatched build dependency, not other versions or dependency paths.
export function reviewAudit(report) {
  if (
    !report ||
    typeof report.advisories !== 'object' ||
    !report.advisories ||
    !report.metadata?.vulnerabilities
  )
    throw new Error('Invalid dependency audit response.')
  const advisories = Object.values(report.advisories)
  const reportedCount = Object.values(report.metadata.vulnerabilities).reduce((sum, count) => {
    if (!Number.isInteger(count) || count < 0) throw new Error('Invalid vulnerability count.')
    return sum + count
  }, 0)
  if (reportedCount !== advisories.length) throw new Error('Incomplete dependency audit response.')
  for (const advisory of advisories) {
    if (
      advisory.module_name !== 'node-forge' ||
      advisory.github_advisory_id !== knownAdvisory ||
      advisory.patched_versions !== null ||
      !Array.isArray(advisory.findings) ||
      advisory.findings.length === 0 ||
      advisory.findings.some(
        (finding) =>
          finding.version !== '1.4.0' ||
          !Array.isArray(finding.paths) ||
          finding.paths.length === 0 ||
          finding.paths.some((dependencyPath) => dependencyPath !== buildOnlyPath),
      )
    ) {
      throw new Error(
        `Unreviewed vulnerability: ${advisory.github_advisory_id ?? advisory.module_name}`,
      )
    }
  }
  return advisories.length
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packageManager = process.env.npm_execpath
  if (!packageManager) throw new Error('Run this check through pnpm check:dependencies.')
  const runtime = spawnSync(process.execPath, ['scripts/check-runtime.mjs'], { stdio: 'inherit' })
  if (runtime.status !== 0) throw new Error('Production runtime boundary was not verified.')
  const audit = spawnSync(process.execPath, [packageManager, 'audit', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (audit.error || ![0, 1].includes(audit.status))
    throw new Error('Dependency audit failed to run.')
  const knownCount = reviewAudit(JSON.parse(audit.stdout))
  if (knownCount) {
    console.log(
      `Known unpatched build-only advisory: https://github.com/advisories/${knownAdvisory}`,
    )
    console.log(
      'node-forge is excluded from the checked production runtime; this is not a clean audit.',
    )
  } else console.log('No production dependency advisories reported.')
}
