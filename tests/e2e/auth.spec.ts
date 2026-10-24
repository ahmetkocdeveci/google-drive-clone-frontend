import { test, expect } from '@playwright/test'
import { apiBase, credentials, mailLink, requireTestEnvironment } from './helpers'

test.beforeAll(requireTestEnvironment)

test('register through the UI, verify the real local email, and create an Owner workspace', async ({
  page,
}) => {
  const account = credentials('Registration')
  await page.goto('/register')
  await page.getByLabel('Ad soyad', { exact: true }).fill(account.name)
  await page.getByLabel('E-posta adresi', { exact: true }).fill(account.email)
  await page.getByLabel('Şifre', { exact: true }).fill(account.password)
  await page.getByLabel('Şifreyi tekrar yaz', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Hesap oluştur', exact: true }).click()
  await expect(page).toHaveURL(/\/verify-email/)
  await page.goto(await mailLink(account.email, '/verify-email'))
  await page.getByRole('button', { name: 'E-postamı doğrula', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'E-postan doğrulandı' })).toBeVisible()
  await page.getByRole('link', { name: 'Devam et', exact: true }).click()
  await expect(page).toHaveURL(/\/workspaces$/)
  const session = await page.request.get(`${apiBase}/auth/me`)
  expect((await session.json()).user.emailVerified).toBe(true)
  await page.getByRole('button', { name: 'Yeni çalışma alanı', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Çalışma alanı oluştur', exact: true })
  await dialog.getByLabel('Çalışma alanı adı', { exact: true }).fill('E2E Registration Workspace')
  await dialog.getByRole('button', { name: 'Alanı oluştur', exact: true }).click()
  await expect(page).toHaveURL(/\/workspaces\/[^/]+\/files$/)
  await expect(page.getByRole('link', { name: 'Takım üyeleri', exact: true })).toBeVisible()
  const workspacePath = new URL(page.url()).pathname
  await page.getByRole('button', { name: 'Çıkış yap', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect((await page.request.get(`${apiBase}/workspaces`)).status()).toBe(401)
  await page.goto(workspacePath)
  await expect(page).toHaveURL(/\/login\?returnTo=/)
})

test('password reset uses its real mail link and returns to login with a new password', async ({
  page,
}) => {
  const account = credentials('Reset')
  await page.goto('/register')
  await page.getByLabel('Ad soyad', { exact: true }).fill(account.name)
  await page.getByLabel('E-posta adresi', { exact: true }).fill(account.email)
  await page.getByLabel('Şifre', { exact: true }).fill(account.password)
  await page.getByLabel('Şifreyi tekrar yaz', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Hesap oluştur', exact: true }).click()
  await expect(page).toHaveURL(/\/verify-email/)
  await page.goto(await mailLink(account.email, '/verify-email'))
  await page.getByRole('button', { name: 'E-postamı doğrula', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'E-postan doğrulandı' })).toBeVisible()
  await page.goto('/forgot-password')
  await page.getByLabel('E-posta adresi', { exact: true }).fill(account.email)
  await page.getByRole('button', { name: 'Yenileme bağlantısı gönder' }).click()
  await expect(
    page.getByRole('region', { name: 'Şifreni yenile' }).getByRole('status'),
  ).toContainText('Bu adresle bir hesap varsa')
  await page.goto(await mailLink(account.email, '/reset-password'))
  const replacement = `New1!${crypto.randomUUID()}`
  await page.getByLabel('Yeni şifre', { exact: true }).fill(replacement)
  await page.getByLabel('Yeni şifreyi tekrar yaz', { exact: true }).fill(replacement)
  await page.getByRole('button', { name: 'Şifremi yenile', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('E-posta adresi', { exact: true }).fill(account.email)
  await page.getByLabel('Şifre', { exact: true }).fill(replacement)
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click()
  await expect(page).toHaveURL(/\/workspaces$/)
})
