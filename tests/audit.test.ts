import test from 'node:test'
import assert from 'node:assert/strict'
import { createMockDriveApi } from '../app/services/mock-drive-api.ts'
import { createHttpDriveApi } from '../app/services/http-drive-api.ts'
import { createAuditHistory, auditActionLabel } from '../app/services/audit-history.ts'
import { ApiError } from '../app/services/api-error.ts'
import type { AuditEvent, Page } from '../shared/types.ts'

const failure = (status: number) => (cause: unknown) =>
  cause instanceof ApiError && cause.status === status
const event = (id: string, workspaceId = 'a'): AuditEvent => ({
  id,
  workspaceId,
  action: 'folder.created',
  actor: { id: 'actor', name: 'Test user' },
  createdAt: new Date().toISOString(),
})
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('demo audit contains only actual tenant mutations and enforces Owner policy', async () => {
  const api = createMockDriveApi()
  assert.deepEqual((await api.listAuditEventsPage('ws-design')).items, [])
  const folder = await api.createFolder('ws-design', { name: 'A real mutation', parentId: null })
  await api.createFolder('ws-product', { name: 'Another tenant', parentId: null })
  const page = await api.listAuditEventsPage('ws-design')
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0]?.targetId, folder.id)
  assert.equal(page.items[0]?.actor.id, 'user-ahmet')
  assert.equal(page.items[0]?.action, 'folder.created')
  assert.equal(Object.hasOwn(page.items[0]!.actor, 'email'), false)
  await assert.rejects(api.listAuditEventsPage('ws-product'), failure(403))
  await assert.rejects(api.listAuditEventsPage('other'), failure(404))
  await api.login({ email: 'elif@example.com', password: 'Demo1234!' })
  await assert.rejects(api.listAuditEventsPage('ws-design'), failure(403))
  await api.login({ email: 'deniz@example.com', password: 'Demo1234!' })
  await assert.rejects(api.listAuditEventsPage('ws-design'), failure(403))
})

test('demo audit paginates all mutations and rejects a stale cursor after another mutation', async () => {
  const api = createMockDriveApi()
  for (let index = 0; index < 107; index++)
    await api.createFolder('ws-design', { name: `Event ${index}`, parentId: null })
  const ids: string[] = []
  let cursor: string | undefined
  do {
    const page = await api.listAuditEventsPage('ws-design', { limit: 25, cursor })
    ids.push(...page.items.map((item) => item.id))
    cursor = page.nextCursor || undefined
  } while (cursor)
  assert.equal(ids.length, 107)
  assert.equal(new Set(ids).size, 107)
  const first = await api.listAuditEventsPage('ws-design', { limit: 2 })
  await api.updateWorkspace('ws-design', { name: 'New change' })
  await assert.rejects(
    api.listAuditEventsPage('ws-design', { limit: 2, cursor: first.nextCursor! }),
    failure(409),
  )
})

test('HTTP audit paging encodes scope and cursor, sends cookies and preserves cancellation', async () => {
  const controller = new AbortController()
  const api = createHttpDriveApi({
    fetch: async (input, init) => {
      assert.equal(
        String(input),
        '/api/v1/workspaces/a%2Fb/audit-events?limit=25&cursor=opaque%2B%2F%3D',
      )
      assert.equal(init?.method, 'GET')
      assert.equal(init.credentials, 'include')
      assert.equal(init.signal, controller.signal)
      assert.equal(new Headers(init.headers).has('X-CSRF-Token'), false)
      return Response.json({ items: [event('1', 'a/b')], nextCursor: null })
    },
  })
  assert.equal(
    (
      await api.listAuditEventsPage(
        'a/b',
        { limit: 25, cursor: 'opaque+/=' },
        { signal: controller.signal },
      )
    ).items[0]?.id,
    '1',
  )
})

test('audit history cannot publish an old account or workspace response after scope changes', async () => {
  let scope = { workspaceId: 'a', userId: 'owner-a', sessionRevision: 1, canRead: true }
  const old = deferred<Page<AuditEvent>>()
  let calls = 0,
    oldSignal: AbortSignal | undefined
  const history = createAuditHistory(
    () => scope,
    async (wid, _query, options) => {
      calls++
      if (calls === 1) {
        oldSignal = options.signal
        return old.promise
      }
      return { items: [event('new', wid)], nextCursor: null }
    },
  )
  const first = history.refresh()
  scope = { workspaceId: 'b', userId: 'owner-b', sessionRevision: 2, canRead: true }
  await history.refresh()
  assert.equal(oldSignal?.aborted, true)
  old.resolve({ items: [event('old')], nextCursor: null })
  await first
  assert.deepEqual(
    history.items.value.map((item) => item.id),
    ['new'],
  )
  scope = { ...scope, canRead: false }
  await history.refresh()
  assert.deepEqual(history.items.value, [])
  assert.equal(calls, 2)
  history.dispose()
})

test('audit history exposes stale-page refresh and clears sensitive rows on lost access', async () => {
  const scope = { workspaceId: 'a', userId: 'owner', sessionRevision: 1, canRead: true }
  let mode: 'ok' | 'stale' | 'forbidden' = 'ok'
  const history = createAuditHistory(
    () => scope,
    async () => {
      if (mode === 'stale') throw new ApiError(409, 'PAGINATION_STALE', 'Changed')
      if (mode === 'forbidden') throw new ApiError(403, 'FORBIDDEN', 'Forbidden')
      return { items: [event('one')], nextCursor: 'next' }
    },
  )
  await history.refresh()
  mode = 'stale'
  await history.more()
  assert.equal(history.needsRefresh.value, true)
  assert.equal(history.nextCursor.value, null)
  mode = 'ok'
  await history.refresh()
  mode = 'forbidden'
  await history.more()
  assert.equal(history.accessLost.value, true)
  assert.deepEqual(history.items.value, [])
  history.dispose()
})

test('audit history disposal cancels work and late failures cannot replace a fresh page', async () => {
  const scope = { workspaceId: 'a', userId: 'owner', sessionRevision: 1, canRead: true }
  const late = deferred<Page<AuditEvent>>()
  let signal: AbortSignal | undefined,
    calls = 0
  const history = createAuditHistory(
    () => scope,
    async (_wid, _query, options) => {
      calls++
      if (calls === 1) {
        signal = options.signal
        return late.promise
      }
      return { items: [event('fresh')], nextCursor: null }
    },
  )
  const first = history.refresh()
  await history.refresh()
  late.reject(new ApiError(403, 'FORBIDDEN', 'Old session'))
  await first
  assert.equal(signal?.aborted, true)
  assert.deepEqual(
    history.items.value.map((item) => item.id),
    ['fresh'],
  )
  assert.equal(history.accessLost.value, false)
  history.dispose()
  await history.refresh()
  assert.equal(calls, 2)
  assert.deepEqual(history.items.value, [])
})

test('unknown audit actions use a fixed label including prototype names and markup', () => {
  assert.equal(auditActionLabel('folder.created'), 'Klasör oluşturuldu')
  for (const action of ['constructor', '__proto__', '<img src=x onerror=alert(1)>'])
    assert.equal(auditActionLabel(action), 'İşlem kaydı')
})
