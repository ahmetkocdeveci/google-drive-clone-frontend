import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { deleteWorkspace, newWorkspace, openAs, requireTestEnvironment, verifiedAccount } from './helpers'

test.beforeAll(requireTestEnvironment)
test('narrow mobile navigation, dialog and accessibility', async ({ page }, testInfo) => {
  const owner = await verifiedAccount('Mobile'), workspace = await newWorkspace(owner.api)
  try {
    await openAs(page, owner.api, `/workspaces/${workspace.id}/files`)
    await page.getByRole('button', { name: 'Gezinmeyi aç', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Gezinmeyi kapat', exact: true }).first()).toBeVisible()
    await page.getByRole('link', { name: 'Hesap güvenliği', exact: true }).click()
    await expect(page).toHaveURL(/\/account$/)
    await page.getByRole('link', { name: 'Çalışma alanlarıma dön', exact: true }).click()
    await page.getByRole('button', { name: new RegExp(workspace.name) }).click()
    await page.getByRole('button', { name: 'Yeni klasör', exact: true }).first().click()
    await expect(page.getByRole('dialog', { name: 'Yeni klasör', exact: true })).toBeVisible()
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(horizontalOverflow).toBe(false)
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('mobile-accessibility-findings', { body: JSON.stringify(scan.violations, null, 2), contentType: 'application/json' })
    expect(scan.violations).toEqual([])
  } finally { await deleteWorkspace(owner.api, workspace.id); await owner.api.dispose() }
})
