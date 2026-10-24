import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewAudit } from '../scripts/check-dependencies.mjs'

function knownReport() {
  return {
    advisories: {
      known: {
        module_name: 'node-forge',
        github_advisory_id: 'GHSA-86w9-cpqp-85rv',
        patched_versions: null,
        findings: [
          { version: '1.4.0', paths: ['.>nuxt>@nuxt/nitro-server>nitropack>listhen>node-forge'] },
        ],
      },
    },
    metadata: { vulnerabilities: { high: 1 } },
  }
}
test('allows a clean audit and the exact reviewed build-only exception', () => {
  assert.equal(reviewAudit({ advisories: {}, metadata: { vulnerabilities: { high: 0 } } }), 0)
  assert.equal(reviewAudit(knownReport()), 1)
})
test('rejects an advisory introduced by another dependency', () => {
  const report = knownReport()
  report.advisories.known.module_name = 'another-package'
  assert.throws(() => reviewAudit(report), /Unreviewed/)
})
test('rejects node-forge reachable from another dependency path', () => {
  const report = knownReport()
  report.advisories.known.findings[0].paths.push('.>application>node-forge')
  assert.throws(() => reviewAudit(report), /Unreviewed/)
})
test('requires review again when a patch becomes available', () => {
  const report = knownReport()
  report.advisories.known.patched_versions = '>=1.4.1'
  assert.throws(() => reviewAudit(report), /Unreviewed/)
})
test('fails closed for missing findings and incomplete audit responses', () => {
  const report = knownReport()
  report.advisories.known.findings = []
  assert.throws(() => reviewAudit(report), /Unreviewed/)
  assert.throws(() => reviewAudit({}), /Invalid/)
  const incomplete = knownReport()
  incomplete.metadata.vulnerabilities.high = 2
  assert.throws(() => reviewAudit(incomplete), /Incomplete/)
})
