import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { deleteWorkspace, newWorkspace, openAs, requireTestEnvironment, verifiedAccount } from './helpers'

test.beforeAll(requireTestEnvironment)
for (const pathname of ['/login', '/register', '/forgot-password']) {
  test(`WCAG A/AA scan: ${pathname}`, async ({ page }, testInfo) => {
    await page.goto(pathname)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('accessibility-findings', { body: JSON.stringify(scan.violations, null, 2), contentType: 'application/json' })
    expect(scan.violations).toEqual([])
  })
}

test('WCAG A/AA scan: workspace and open keyboard dialog', async ({ page }, testInfo) => {
  const owner = await verifiedAccount('Accessibility'), workspace = await newWorkspace(owner.api)
  try {
    await openAs(page, owner.api, `/workspaces/${workspace.id}/files`)
    await expect(page.getByRole('heading', { name: 'Dosyalar', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Yeni klasör', exact: true }).first().click()
    await expect(page.getByRole('dialog', { name: 'Yeni klasör', exact: true })).toBeVisible()
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('dialog-accessibility-findings', { body: JSON.stringify(scan.violations, null, 2), contentType: 'application/json' })
    expect(scan.violations).toEqual([])
  } finally { await deleteWorkspace(owner.api, workspace.id); await owner.api.dispose() }
})
