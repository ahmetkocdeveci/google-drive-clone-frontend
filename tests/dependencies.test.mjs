import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewAudit } from '../scripts/check-dependencies.mjs'

function cleanReport() {
  return {
    advisories: {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
  }
}
test('accepts only a complete clean audit', () => {
  assert.equal(reviewAudit(cleanReport()), 0)
})
test('rejects the formerly excepted node-forge advisory', () => {
  const report = cleanReport()
  report.advisories.known = { module_name: 'node-forge', github_advisory_id: 'GHSA-86w9-cpqp-85rv' }
  report.metadata.vulnerabilities.high = 1
  assert.throws(() => reviewAudit(report), /no audit exceptions/)
})
test('rejects every severity, including development tooling findings', () => {
  for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
    const report = cleanReport()
    report.advisories.other = { module_name: 'another-package', severity }
    report.metadata.vulnerabilities[severity] = 1
    assert.throws(() => reviewAudit(report), /vulnerabilities found/)
  }
})
test('fails closed for missing or inconsistent audit data', () => {
  assert.throws(() => reviewAudit({}), /Invalid/)
  const report = cleanReport()
  report.metadata.vulnerabilities.high = 1
  assert.throws(() => reviewAudit(report), /Incomplete/)
  const missing = cleanReport()
  delete missing.metadata.vulnerabilities.critical
  assert.throws(() => reviewAudit(missing), /Invalid/)
})
test('rejects registry errors and malformed vulnerability counts', () => {
  assert.throws(
    () => reviewAudit({ ...cleanReport(), error: { code: 'REGISTRY_ERROR' } }),
    /Invalid/,
  )
  for (const value of [-1, 0.5, '0', null]) {
    const report = cleanReport()
    report.metadata.vulnerabilities.high = value
    assert.throws(() => reviewAudit(report), /Invalid/)
  }
})
