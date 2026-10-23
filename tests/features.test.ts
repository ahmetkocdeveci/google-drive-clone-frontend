import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockDriveApi } from '../app/services/mock-drive-api.ts'
import { createHttpDriveApi } from '../app/services/http-drive-api.ts'
import { ApiError } from '../app/services/api-error.ts'
import type { ArchiveJob, DriveNode } from '../shared/types.ts'

const failure = (status: number, code?: string) => (error: unknown) => error instanceof ApiError && error.status === status && (!code || error.code === code)

test('Google invitation context uses credentialed CSRF-protected POST and never the request URL', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const token = 'a'.repeat(43), controller = new AbortController()
  const api = createHttpDriveApi({ baseUrl: 'http://api.test/api/v1', fetch: async (input, init) => {
    const url = String(input); calls.push({ url, init: init! })
    return Response.json(url.endsWith('/auth/csrf-token') ? { csrfToken: 'csrf-key' } : { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth' })
  } })
  await api.startGoogleSignIn({ returnTo: '/invitations/accept', invitationToken: token }, { signal: controller.signal })
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => !call.url.includes(token)))
  assert.equal(calls[1]!.init.method, 'POST'); assert.equal(calls[1]!.init.credentials, 'include')
  assert.equal((calls[1]!.init.headers as Record<string, string>)['X-CSRF-Token'], 'csrf-key')
  assert.equal(calls[1]!.init.signal, controller.signal)
  assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), { returnTo: '/invitations/accept', invitationToken: token })
})

test('paged node listing reaches more than 500 entries without omissions or duplicates', async () => {
  const api = createMockDriveApi()
  for (let index = 0; index < 505; index++) await api.createFolder('ws-design', { parentId: null, name: `Folder ${String(index).padStart(4, '0')}` })
  const ids: string[] = []
  let cursor: string | undefined
  do {
    const page = await api.listNodesPage('ws-design', { parentId: null, type: 'folder', sort: 'name', direction: 'asc', limit: 100, cursor })
    assert.ok(page.items.length <= 100)
    ids.push(...page.items.map(node => node.id))
    cursor = page.nextCursor || undefined
  } while (cursor)
  assert.equal(ids.length, 508)
  assert.equal(new Set(ids).size, ids.length)
})

test('demo cursors are bound to identity, tenant, query, page size and current data', async () => {
  const api = createMockDriveApi()
  const query = { parentId: null, sort: 'name' as const, limit: 1 }
  const page = await api.listNodesPage('ws-design', query)
  assert.ok(page.nextCursor)
  await assert.rejects(api.listNodesPage('ws-product', { ...query, cursor: page.nextCursor }), failure(409))
  await assert.rejects(api.listNodesPage('ws-design', { ...query, type: 'folder', cursor: page.nextCursor }), failure(409))
  await assert.rejects(api.listNodesPage('ws-design', { ...query, limit: 2, cursor: page.nextCursor }), failure(409))
  await api.login({ email: 'deniz@example.com', password: 'Demo1234!' })
  await assert.rejects(api.listNodesPage('ws-design', { ...query, cursor: page.nextCursor }), failure(409))
  await api.login({ email: 'ahmet@example.com', password: 'Demo1234!' })
  await api.createFolder('ws-design', { name: 'Changed', parentId: null })
  await assert.rejects(api.listNodesPage('ws-design', { ...query, cursor: page.nextCursor }), failure(409))
  await assert.rejects(api.listNodesPage('ws-design', { ...query, cursor: 'forged' }), failure(400))
})

test('workspace, member and invitation pagers expose every page and retain backend role checks', async () => {
  const api = createMockDriveApi()
  const first = await api.listWorkspacesPage({ limit: 1 })
  assert.equal(first.items.length, 1)
  assert.equal((await api.listWorkspacesPage({ limit: 1, cursor: first.nextCursor! })).items.length, 1)
  const members = await api.listMembersPage('ws-design', { limit: 1 })
  assert.equal((await api.listMembersPage('ws-design', { limit: 1, cursor: members.nextCursor! })).items.length, 1)
  await assert.rejects(api.listMembersPage('ws-product'), failure(403))
  await api.inviteMember('ws-design', { email: 'first@example.com', role: 'viewer' })
  await api.inviteMember('ws-design', { email: 'second@example.com', role: 'editor' })
  const invitations = await api.listInvitationsPage('ws-design', { limit: 1 })
  assert.equal((await api.listInvitationsPage('ws-design', { limit: 1, cursor: invitations.nextCursor! })).items.length, 1)
})

test('password reset simulation is generic, one-use, replaces the password and signs out', async () => {
  const api = createMockDriveApi()
  assert.equal(await api.requestPasswordReset({ email: 'absent@example.com' }), undefined)
  await assert.rejects(api.confirmPasswordReset({ token: 'demo-password-reset', password: 'Replacement123!' }), failure(404))
  await api.requestPasswordReset({ email: 'ahmet@example.com' })
  await api.confirmPasswordReset({ token: 'demo-password-reset', password: 'Replacement123!' })
  assert.equal(await api.getSession(), null)
  await assert.rejects(api.login({ email: 'ahmet@example.com', password: 'Demo1234!' }), failure(401))
  assert.equal((await api.login({ email: 'ahmet@example.com', password: 'Replacement123!' })).user.email, 'ahmet@example.com')
  await assert.rejects(api.confirmPasswordReset({ token: 'demo-password-reset', password: 'Again123!' }), failure(404))
  const registered = await api.register({ name: 'Reset proof', email: 'reset-proof@example.com', password: 'Before123!' })
  assert.equal(registered.user.emailVerified, false)
  await api.requestPasswordReset({ email: registered.user.email })
  await api.confirmPasswordReset({ token: 'demo-password-reset', password: 'After123!' })
  assert.equal((await api.login({ email: registered.user.email, password: 'After123!' })).user.emailVerified, true)
})

test('HTTP reset accepts an empty generic 202 and obtains a fresh CSRF token after confirmation', async () => {
  let tokens = 0
  const writes: { url: string; init?: RequestInit }[] = []
  const api = createHttpDriveApi({ fetch: async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/csrf-token')) return Response.json({ csrfToken: `csrf-${++tokens}` })
    writes.push({ url, init })
    if (url.endsWith('/password-reset/request')) return new Response(null, { status: 202 })
    if (url.endsWith('/password-reset/confirm')) return new Response(null, { status: 204 })
    return Response.json({ user: { id: 'signed-in' } })
  } })
  await api.requestPasswordReset({ email: 'any@example.com' })
  await api.confirmPasswordReset({ token: 'secret-link', password: 'New-password' })
  await api.login({ email: 'any@example.com', password: 'New-password' })
  assert.equal(tokens, 2)
  assert.equal(new Headers(writes[0]?.init?.headers).get('X-CSRF-Token'), 'csrf-1')
  assert.equal(new Headers(writes[2]?.init?.headers).get('X-CSRF-Token'), 'csrf-2')
})

test('HTTP pagers encode workspace and opaque cursor and keep cookies on the API only', async () => {
  const urls: string[] = []
  const api = createHttpDriveApi({ fetch: async (input, init) => {
    urls.push(String(input)); assert.equal(init?.credentials, 'include')
    return Response.json({ items: [], nextCursor: null })
  } })
  await api.listWorkspacesPage({ limit: 50, cursor: 'opaque+/=' })
  await api.listNodesPage('tenant/a', { parentId: null, limit: 100, cursor: 'opaque+/=' })
  await api.listMembersPage('tenant/a', { limit: 100 })
  await api.listInvitationsPage('tenant/a', { limit: 100 })
  assert.equal(urls[0], '/api/v1/workspaces/page?limit=50&cursor=opaque%2B%2F%3D')
  assert.equal(urls[1], '/api/v1/workspaces/tenant%2Fa/nodes/page?parentId=root&limit=100&cursor=opaque%2B%2F%3D')
  assert.ok(urls[2]?.includes('/members/page?'))
  assert.ok(urls[3]?.includes('/invitations/page?'))
})

function archiveJob(status: ArchiveJob['status'], processedFiles = 0): ArchiveJob {
  return { id: 'archive-1', workspaceId: 'workspace', nodeId: 'folder', filename: 'Export.zip', status, processedFiles, bytes: 0, createdAt: new Date().toISOString() }
}

test('async archive adapter reports progress, polls and downloads only after ready', async () => {
  const methods: string[] = [], progress: string[] = []
  let polls = 0
  const api = createHttpDriveApi({ fetch: async (input, init) => {
    const url = String(input), method = init?.method || 'GET'; methods.push(`${method} ${url}`)
    if (url.endsWith('/auth/csrf-token')) return Response.json({ csrfToken: 'csrf' })
    if (url.endsWith('/archives')) return Response.json(archiveJob('pending'), { status: 202 })
    if (url.endsWith('/content')) return new Response(new Uint8Array([80, 75]), { headers: { 'Content-Type': 'application/zip' } })
    return Response.json(archiveJob(++polls === 1 ? 'running' : 'ready', polls))
  } })
  const content = await api.downloadFolder('workspace', 'folder', { pollIntervalMs: 1, timeoutMs: 1000, onProgress: job => progress.push(job.status) })
  assert.deepEqual(progress, ['pending', 'running', 'ready'])
  assert.equal(content.mimeType, 'application/zip')
  assert.ok(methods.includes('GET /api/v1/workspaces/workspace/archives/archive-1/content'))
  assert.equal(methods.at(-1), 'DELETE /api/v1/workspaces/workspace/archives/archive-1')
  assert.ok(methods.includes('POST /api/v1/workspaces/workspace/archives'))
})

test('downloaded archive remains available when best-effort server cleanup fails', async () => {
  let cleanupSignal: AbortSignal | null | undefined
  const caller = new AbortController()
  const api = createHttpDriveApi({ fetch: async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/csrf-token')) return Response.json({ csrfToken: 'csrf' })
    if (init?.method === 'DELETE') { cleanupSignal = init.signal; throw new Error('cleanup temporarily unavailable') }
    if (url.endsWith('/content')) { caller.abort(); return new Response(new Uint8Array([80, 75]), { headers: { 'Content-Type': 'application/zip' } }) }
    return Response.json(archiveJob('ready'))
  } })
  const result = await api.downloadFolder('workspace', 'folder', { signal: caller.signal })
  assert.deepEqual([...new Uint8Array(await result.blob.arrayBuffer())], [80, 75])
  assert.notEqual(cleanupSignal, caller.signal)
  assert.equal(cleanupSignal?.aborted, false)
})

test('cancelling archive preparation cancels the unfinished server job without downloading content', async () => {
  const methods: string[] = [], controller = new AbortController()
  const api = createHttpDriveApi({ fetch: async (input, init) => {
    const url = String(input); methods.push(`${init?.method || 'GET'} ${url}`)
    if (url.endsWith('/auth/csrf-token')) return Response.json({ csrfToken: 'csrf' })
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return Response.json(archiveJob('pending'), { status: 202 })
  } })
  await assert.rejects(api.downloadFolder('workspace', 'folder', { signal: controller.signal, onProgress: () => controller.abort(), timeoutMs: 1000 }), { name: 'AbortError' })
  assert.ok(methods.includes('DELETE /api/v1/workspaces/workspace/archives/archive-1'))
  assert.equal(methods.some(url => url.endsWith('/content')), false)
})

test('archive polling has a finite deadline and cleans up unfinished jobs on timeout', async () => {
  let cancelled = false
  const api = createHttpDriveApi({ fetch: async (input, init) => {
    if (String(input).endsWith('/auth/csrf-token')) return Response.json({ csrfToken: 'csrf' })
    if (init?.method === 'DELETE') { cancelled = true; return new Response(null, { status: 204 }) }
    return Response.json(archiveJob('running'))
  } })
  await assert.rejects(api.downloadFolder('workspace', 'folder', { timeoutMs: 15, pollIntervalMs: 50 }), failure(408, 'ARCHIVE_TIMEOUT'))
  assert.equal(cancelled, true)
})

test('cancelling a ready archive body releases its slot with an independent cleanup signal', async () => {
  const caller = new AbortController()
  let cleanups = 0
  const api = createHttpDriveApi({ fetch: async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/csrf-token')) return Response.json({ csrfToken: 'csrf' })
    if (init?.method === 'DELETE') {
      cleanups++
      assert.notEqual(init.signal, caller.signal)
      assert.equal(init.signal?.aborted, false)
      return new Response(null, { status: 204 })
    }
    if (url.endsWith('/content')) return new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new Uint8Array([80, 75]))
      init!.signal!.addEventListener('abort', () => stream.error(init!.signal!.reason), { once: true })
      queueMicrotask(() => caller.abort())
    } }))
    return Response.json(archiveJob('ready'), { status: 202 })
  } })
  await assert.rejects(api.downloadFolder('workspace', 'folder', { signal: caller.signal }), { name: 'AbortError' })
  assert.equal(cleanups, 1)
})

test('a ready archive is released when cancelled from its ready progress callback', async () => {
  const caller = new AbortController()
  let cleanups = 0, contentReads = 0
  const api = createHttpDriveApi({ fetch: async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/csrf-token')) return Response.json({ csrfToken: 'csrf' })
    if (init?.method === 'DELETE') { cleanups++; return new Response(null, { status: 204 }) }
    if (url.endsWith('/content')) contentReads++
    return Response.json(archiveJob('ready'), { status: 202 })
  } })
  await assert.rejects(api.downloadFolder('workspace', 'folder', { signal: caller.signal, onProgress: () => caller.abort() }), { name: 'AbortError' })
  assert.equal(cleanups, 1)
  assert.equal(contentReads, 0)
})

test('a failed ready archive transfer is released and cleanup failure preserves the safe download error', async () => {
  let cleanups = 0
  const api = createHttpDriveApi({ fetch: async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/csrf-token')) return Response.json({ csrfToken: 'csrf' })
    if (init?.method === 'DELETE') { cleanups++; throw new Error('SMTP/storage/internal detail must not replace the transfer error') }
    if (url.endsWith('/content')) return new Response(new ReadableStream({ start(stream) { stream.error(new TypeError('terminated: private transport detail')) } }))
    return Response.json(archiveJob('ready'), { status: 202 })
  } })
  await assert.rejects(api.downloadFolder('workspace', 'folder'), error => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.code, 'DOWNLOAD_INTERRUPTED')
    assert.match(error.message, /İndirme kesildi/)
    assert.doesNotMatch(error.message, /terminated|private|internal/)
    return true
  })
  assert.equal(cleanups, 1)
})

test('file body failures use a safe Turkish message while deliberate cancellation keeps its reason', async () => {
  const transportError = new TypeError('terminated')
  const failed = createHttpDriveApi({ fetch: async () => new Response(new ReadableStream({ start(stream) { stream.error(transportError) } })) })
  await assert.rejects(failed.getContent('workspace', 'file'), error => error instanceof ApiError && error.code === 'DOWNLOAD_INTERRUPTED' && error.message.startsWith('İndirme kesildi.'))

  const caller = new AbortController(), reason = new DOMException('User cancelled', 'AbortError')
  const cancelled = createHttpDriveApi({ fetch: async () => new Response(new ReadableStream({ start(stream) {
    caller.abort(reason)
    stream.error(new TypeError('body was interrupted after abort'))
  } })) })
  await assert.rejects(cancelled.getContent('workspace', 'file', { signal: caller.signal }), error => error === reason)
  const abortOnly = createHttpDriveApi({ fetch: async () => new Response(new ReadableStream({ start(stream) { stream.error(reason) } })) })
  await assert.rejects(abortOnly.getContent('workspace', 'file'), error => error === reason)
})
