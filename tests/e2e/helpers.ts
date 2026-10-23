import { randomUUID } from 'node:crypto'
import { expect, request, type APIRequestContext, type Page } from '@playwright/test'

export const frontendOrigin = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179'
export const apiOrigin = process.env.E2E_API_ORIGIN || 'http://127.0.0.1:4100'
export const mailpitOrigin = process.env.E2E_MAILPIT_ORIGIN || 'http://127.0.0.1:8025'
export const apiBase = `${apiOrigin}/api/v1`

export function requireTestEnvironment() {
  if (process.env.E2E_TEST_ENVIRONMENT !== '1') throw new Error('E2E_TEST_ENVIRONMENT=1 is required for an isolated test database and local mail inbox.')
  for (const origin of [frontendOrigin, apiOrigin, mailpitOrigin]) {
    const url = new URL(origin)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('E2E account creation is restricted to a local test environment.')
  }
}

export function credentials(label = 'User') {
  return { name: `E2E ${label}`, email: `e2e-${randomUUID()}@example.test`, password: `Test1!${randomUUID()}` }
}

export async function mutate(api: APIRequestContext, path: string, method = 'POST', data?: unknown) {
  const tokenResponse = await api.get(`${apiBase}/auth/csrf-token`)
  expect(tokenResponse.status()).toBe(200)
  const { csrfToken } = await tokenResponse.json() as { csrfToken: string }
  return api.fetch(`${apiBase}${path}`, { method, data, headers: { Origin: frontendOrigin, 'X-CSRF-Token': csrfToken } })
}

/** Dedicated mailbox context never receives the application's cookies. */
export async function mailLink(email: string, pathname: '/verify-email' | '/invitations/accept' | '/reset-password') {
  const inbox = await request.newContext()
  let link = ''
  try {
    await expect.poll(async () => {
      const response = await inbox.get(`${mailpitOrigin}/api/v1/messages?limit=100`)
      if (!response.ok()) return false
      const { messages = [] } = await response.json() as { messages?: Array<{ ID: string; To?: Array<{ Address: string }> }> }
      for (const record of messages.filter(item => item.To?.some(recipient => recipient.Address.toLowerCase() === email.toLowerCase()))) {
        const detail = await inbox.get(`${mailpitOrigin}/api/v1/message/${encodeURIComponent(record.ID)}`)
        if (!detail.ok()) continue
        const body = await detail.json() as { Text?: string }
        for (const candidate of body.Text?.match(/https?:\/\/[^\s<>]+/g) || []) {
          const url = new URL(candidate)
          if (url.origin === new URL(frontendOrigin).origin && url.pathname === pathname && new URLSearchParams(url.hash.slice(1)).has('token')) { link = url.href; return true }
        }
      }
      return false
    }, { timeout: 30_000, intervals: [250, 500, 1000], message: 'Expected local test email was not delivered.' }).toBe(true)
    return link
  } finally { await inbox.dispose() }
}

export async function verifiedAccount(label = 'User') {
  requireTestEnvironment()
  const account = credentials(label), api = await request.newContext()
  try {
    const registration = await mutate(api, '/auth/register', 'POST', account)
    expect(registration.status()).toBe(201)
    const link = new URL(await mailLink(account.email, '/verify-email'))
    const token = new URLSearchParams(link.hash.slice(1)).get('token')!
    const verification = await mutate(api, '/auth/email-verification/confirm', 'POST', { token })
    expect(verification.status()).toBe(200)
    return { ...account, api }
  } catch (error) { await api.dispose(); throw error }
}

export async function openAs(page: Page, api: APIRequestContext, pathname = '/workspaces') {
  await page.context().addCookies((await api.storageState()).cookies)
  await page.goto(pathname)
}

export async function newWorkspace(api: APIRequestContext, label = 'Workspace') {
  const response = await mutate(api, '/workspaces', 'POST', { name: `E2E ${label} ${randomUUID().slice(0, 8)}` })
  expect(response.status()).toBe(201)
  return response.json() as Promise<{ id: string; name: string; role: string }>
}

export async function deleteWorkspace(api: APIRequestContext, workspaceId: string) {
  try { await mutate(api, `/workspaces/${encodeURIComponent(workspaceId)}`, 'DELETE') } catch { /* CI destroys its isolated database and object directory after the suite. */ }
}
