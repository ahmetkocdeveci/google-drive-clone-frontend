import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError } from '../app/services/api-error.ts'
import { createMockDriveApi } from '../app/services/mock-drive-api.ts'
import { createHttpDriveApi } from '../app/services/http-drive-api.ts'
import { capabilitiesFor } from '../shared/permissions.ts'
import { resolveDataMode } from '../shared/runtime-config.ts'
import { googleAuthErrorMessage } from '../shared/auth-errors.ts'
import { getFolderPath } from '../app/services/folder-path.ts'
import type { DriveNode } from '../shared/types.ts'

function apiFailure(status: number, code?: string) {
  return (error: unknown) =>
    error instanceof ApiError && error.status === status && (!code || error.code === code)
}

test('the same identity receives separate capabilities for each workspace', async () => {
  const api = createMockDriveApi()
  const workspaces = await api.listWorkspaces()
  assert.deepEqual(
    workspaces.map((w) => w.role),
    ['owner', 'editor', 'viewer'],
  )
  for (const workspace of workspaces)
    assert.deepEqual(workspace.capabilities, capabilitiesFor(workspace.role))
  await assert.rejects(
    api.createFolder('ws-archive', { name: 'Denied', parentId: null }),
    apiFailure(403),
  )
  await assert.rejects(api.listMembers('ws-product'), apiFailure(403))
  const created = await api.createFolder('ws-product', { name: 'Editor can write', parentId: null })
  assert.equal(created.workspaceId, 'ws-product')
})

test('tenant-scoped lookups and parent validation reject known IDs from another workspace', async () => {
  const api = createMockDriveApi()
  await assert.rejects(api.getNode('ws-design', 'file-roadmap'), apiFailure(404))
  await assert.rejects(
    api.createFolder('ws-design', { name: 'Cross tenant', parentId: 'folder-roadmap' }),
    apiFailure(404),
  )
  await assert.rejects(
    api.updateNode('ws-design', 'file-brief', { parentId: 'folder-roadmap' }),
    apiFailure(404),
  )
  await assert.rejects(api.getWorkspace('ws-partner'), apiFailure(404))
  await assert.rejects(api.getContent('ws-archive', 'file-brief'), apiFailure(404))
})

test('folder moves prevent cycles, stale writes fail, and recursive deletion removes direct access', async () => {
  const api = createMockDriveApi()
  await assert.rejects(
    api.updateNode('ws-design', 'folder-design', { parentId: 'folder-references' }),
    apiFailure(409, 'FOLDER_CYCLE'),
  )
  const node = await api.getNode('ws-design', 'file-brief')
  await api.updateNode('ws-design', node.id, { name: 'Yeni ad.txt', version: node.version })
  await assert.rejects(
    api.updateNode('ws-design', node.id, { name: 'Eski yazma.txt', version: node.version }),
    apiFailure(409, 'VERSION_CONFLICT'),
  )
  await api.deleteNodes('ws-design', ['folder-documents'])
  await assert.rejects(api.getNode('ws-design', 'file-notes'), apiFailure(404))
  await assert.rejects(api.getContent('ws-design', 'file-notes'), apiFailure(404))
})

test('bulk delete checks all targets before mutation', async () => {
  const api = createMockDriveApi()
  await assert.rejects(
    api.deleteNodes('ws-design', ['file-brief', 'file-roadmap']),
    apiFailure(404),
  )
  assert.equal((await api.getNode('ws-design', 'file-brief')).name, 'Proje özeti.txt')
})

test('last Owner is protected; transfer changes permissions immediately while retaining Editor content access', async () => {
  const api = createMockDriveApi()
  const members = await api.listMembers('ws-design')
  const owner = members.find((member) => member.isCurrentUser)!
  const target = members.find((member) => member.email === 'elif@example.com')!
  await assert.rejects(
    api.changeMemberRole('ws-design', owner.id, 'editor'),
    apiFailure(409, 'LAST_OWNER'),
  )
  await assert.rejects(api.removeMember('ws-design', owner.id), apiFailure(409, 'LAST_OWNER'))
  assert.equal((await api.transferOwnership('ws-design', target.id)).role, 'editor')
  await assert.rejects(
    api.inviteMember('ws-design', { email: 'new@example.com', role: 'viewer' }),
    apiFailure(403),
  )
  await api.updateNode('ws-design', 'file-brief', { name: 'Editor olarak düzenledim.txt' })
})

test('registration requires explicit demo email verification before workspace access', async () => {
  const api = createMockDriveApi()
  await api.logout()
  assert.equal(await api.getSession(), null)
  const session = await api.register({
    name: 'Yeni Üye',
    email: 'New@Example.com',
    password: 'StrongDemo123!',
  })
  assert.equal(session.user.email, 'new@example.com')
  assert.equal(session.user.emailVerified, false)
  await assert.rejects(api.listWorkspaces(), apiFailure(403, 'EMAIL_NOT_VERIFIED'))
  await assert.rejects(api.verifyEmail({ token: 'incorrect' }), apiFailure(400))
  await api.verifyEmail({ token: 'demo-email-verification' })
  const workspace = await api.createWorkspace({ name: 'Yeni workspace' })
  assert.equal(workspace.role, 'owner')
  assert.equal(workspace.memberCount, 1)
})

test('invitation requires matching verified email, accepts once idempotently, and cannot restore removed access', async () => {
  const api = createMockDriveApi()
  assert.equal((await api.inspectInvitation('demo-invitation')).workspaceName, 'Yeni Proje')
  await api.login({ email: 'deniz@example.com', password: 'Demo1234!' })
  await assert.rejects(api.acceptInvitation('demo-invitation'), apiFailure(404))
  await api.login({ email: 'ahmet@example.com', password: 'Demo1234!' })
  assert.equal((await api.acceptInvitation('demo-invitation')).role, 'editor')
  assert.equal((await api.acceptInvitation('demo-invitation')).role, 'editor')
  await api.login({ email: 'elif@example.com', password: 'Demo1234!' })
  const member = (await api.listMembers('ws-partner')).find((m) => m.email === 'ahmet@example.com')!
  await api.removeMember('ws-partner', member.id)
  await api.login({ email: 'ahmet@example.com', password: 'Demo1234!' })
  await assert.rejects(api.acceptInvitation('demo-invitation'), apiFailure(404))
  await assert.rejects(api.getWorkspace('ws-partner'), apiFailure(404))
})

test('new invitations do not create accounts, revocation blocks acceptance, and tokens stay out of list DTOs', async () => {
  const api = createMockDriveApi()
  const invitation = await api.inviteMember('ws-design', {
    email: 'new@example.com',
    role: 'viewer',
  })
  assert.ok(invitation.demoToken)
  assert.equal((await api.listInvitations('ws-design'))[0]!.demoToken, undefined)
  assert.equal((await api.listMembers('ws-design')).length, 3)
  await api.revokeInvitation('ws-design', invitation.id)
  await api.register({ name: 'Davetli', email: 'new@example.com', password: 'Demo1234!' })
  await api.verifyEmail({ token: 'demo-email-verification' })
  await assert.rejects(api.acceptInvitation(invitation.demoToken!), apiFailure(404))
})

test('upload retains real bytes and folder download produces a valid ZIP structure', async () => {
  const api = createMockDriveApi()
  const original = new Uint8Array([0, 1, 2, 128, 255])
  const progress: number[] = []
  const [node] = await api.uploadFiles(
    'ws-design',
    'folder-design',
    [new File([original], 'binary.dat', { type: 'application/octet-stream' })],
    (p) => progress.push(p.percent),
  )
  assert.ok(node)
  assert.deepEqual(
    new Uint8Array(await (await api.getContent('ws-design', node.id)).blob.arrayBuffer()),
    original,
  )
  assert.equal(progress.at(-1), 100)
  const archive = await api.downloadFolder('ws-design', 'folder-design')
  const bytes = new Uint8Array(await archive.blob.arrayBuffer())
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50)
  assert.equal(new DataView(bytes.buffer).getUint32(bytes.length - 22, true), 0x06054b50)
  assert.ok(new TextDecoder().decode(bytes).includes('binary.dat'))
})

test('already-aborted requests do not mutate the memory adapter', async () => {
  const api = createMockDriveApi()
  const signal = AbortSignal.abort()
  await assert.rejects(api.createWorkspace({ name: 'Cancelled' }, { signal }), {
    name: 'AbortError',
  })
  assert.equal((await api.listWorkspaces()).length, 3)
})

test('HTTP adapter sends CSRF and cookies to API, omits them for signed storage, then completes upload', async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith('/auth/csrf-token')) return Response.json({ csrfToken: 'csrf-test' })
    if (url.endsWith('/files/uploads'))
      return Response.json({
        uploadId: 'upload-1',
        uploadUrl: 'https://bucket.example/signed',
        headers: { 'Content-Type': 'text/plain' },
      })
    if (url.startsWith('https://bucket.example/')) return new Response(null, { status: 200 })
    if (url.endsWith('/complete')) return Response.json({ id: 'file-1', name: 'a.txt' })
    throw new Error(`Unexpected URL: ${url}`)
  }
  const api = createHttpDriveApi({ baseUrl: 'https://api.example/api/v1', fetch: fakeFetch })
  await api.uploadFiles('workspace-a', null, [new File(['hello'], 'a.txt', { type: 'text/plain' })])
  assert.equal(calls.length, 4)
  const apiCall = calls[1]!
  assert.equal(apiCall.init?.credentials, 'include')
  assert.equal(new Headers(apiCall.init?.headers).get('X-CSRF-Token'), 'csrf-test')
  const bucketCall = calls[2]!
  assert.equal(bucketCall.init?.credentials, 'omit')
  assert.equal(new Headers(bucketCall.init?.headers).has('X-CSRF-Token'), false)
  assert.equal(calls[3]!.init?.method, 'POST')
})

test('HTTP adapter maps structured errors, handles anonymous sessions, and preserves abort signal', async () => {
  const signal = new AbortController().signal
  const fakeFetch: typeof fetch = async (input, init) => {
    assert.equal(init?.signal, signal)
    if (String(input).endsWith('/auth/me'))
      return Response.json(
        { error: { code: 'NO_SESSION', message: 'Oturum yok.' } },
        { status: 401 },
      )
    return Response.json({ error: { code: 'FORBIDDEN', message: 'Yetki yok.' } }, { status: 403 })
  }
  const api = createHttpDriveApi({ fetch: fakeFetch })
  assert.equal(await api.getSession({ signal }), null)
  await assert.rejects(api.listNodes('unknown', {}, { signal }), apiFailure(403, 'FORBIDDEN'))
})

test('a cancelled mutation aborts promptly while another request can finish the shared CSRF fetch', async () => {
  let resolveToken!: (response: Response) => void
  const pendingToken = new Promise<Response>((resolve) => {
    resolveToken = resolve
  })
  let csrfCalls = 0
  let writes = 0
  const fakeFetch: typeof fetch = async (input) => {
    if (String(input).endsWith('/auth/csrf-token')) {
      csrfCalls++
      return pendingToken
    }
    writes++
    return Response.json({ id: 'created' })
  }
  const api = createHttpDriveApi({ fetch: fakeFetch })
  const controller = new AbortController()
  const cancelled = api.createWorkspace({ name: 'Cancelled' }, { signal: controller.signal })
  const rejection = assert.rejects(cancelled, { name: 'AbortError' })
  const surviving = api.createWorkspace({ name: 'Survives' })
  controller.abort()
  await rejection
  assert.equal(writes, 0)
  resolveToken(Response.json({ csrfToken: 'shared-token' }))
  await surviving
  assert.equal(csrfCalls, 1)
  assert.equal(writes, 1)
})

test('network failures have a stable error contract and malformed error bodies use safe fallback text', async () => {
  const offline = createHttpDriveApi({
    fetch: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  await assert.rejects(offline.listWorkspaces(), apiFailure(0, 'NETWORK_ERROR'))
  const invalid = createHttpDriveApi({ fetch: async () => Response.json(null, { status: 502 }) })
  await assert.rejects(invalid.listWorkspaces(), apiFailure(502, 'HTTP_502'))
})

test('expired CSRF is refreshed once only after an explicit rejection before mutation', async () => {
  let bootstraps = 0
  let attempts = 0
  let mutations = 0
  const api = createHttpDriveApi({
    fetch: async (input, init) => {
      if (String(input).endsWith('/auth/csrf-token'))
        return Response.json({ csrfToken: `token-${++bootstraps}` })
      attempts++
      if (new Headers(init?.headers).get('X-CSRF-Token') === 'token-1')
        return Response.json({ error: { code: 'CSRF_INVALID' } }, { status: 403 })
      mutations++
      return Response.json({ id: 'created' })
    },
  })
  await api.createWorkspace({ name: 'Real backend' })
  assert.equal(bootstraps, 2)
  assert.equal(attempts, 2)
  assert.equal(mutations, 1)
})

test('real API is the default and invalid deployment modes cannot silently open a demo identity', () => {
  assert.equal(resolveDataMode(undefined), 'http')
  assert.equal(resolveDataMode(''), 'http')
  assert.equal(resolveDataMode('http'), 'http')
  assert.equal(resolveDataMode('demo'), 'demo')
  for (const value of ['production', 'HTTP', 'demoo', true])
    assert.throws(() => resolveDataMode(value), /NUXT_PUBLIC_DATA_MODE/)
})

test('Google callback error codes select fixed messages and cannot reflect arbitrary query values', () => {
  for (const code of [
    'google_cancelled',
    'google_failed',
    'google_account_link_required',
    'google_state_invalid',
    'google_unavailable',
  ]) {
    assert.ok(googleAuthErrorMessage(code).length > 20)
  }
  for (const code of [
    '<script>provider error</script>',
    '__proto__',
    'toString',
    'GOOGLE_FAILED',
    undefined,
    ['google_failed'],
    { code: 'google_failed' },
  ]) {
    assert.equal(googleAuthErrorMessage(code), '')
  }
})

test('auth provider discovery is anonymous, cancelable, and does not create a CSRF mutation', async () => {
  const signal = new AbortController().signal
  const calls: string[] = []
  const api = createHttpDriveApi({
    fetch: async (input, options) => {
      calls.push(String(input))
      assert.equal(options?.method, 'GET')
      assert.equal(options?.credentials, 'include')
      assert.equal(options?.signal, signal)
      assert.equal(new Headers(options?.headers).has('X-CSRF-Token'), false)
      return Response.json({ google: false })
    },
  })
  assert.deepEqual(await api.getAuthProviders({ signal }), { google: false })
  assert.deepEqual(calls, ['/api/v1/auth/providers'])
})

function folderFixture(
  id: string,
  parentId: string | null,
  overrides: Partial<DriveNode> = {},
): DriveNode {
  return {
    id,
    parentId,
    workspaceId: 'workspace',
    name: id,
    kind: 'folder',
    mimeType: '',
    size: 0,
    createdAt: '',
    updatedAt: '',
    createdBy: { id: 'user', name: 'User' },
    version: 1,
    ...overrides,
  }
}

test('folder locations are built in order at the same 64-level limit as the backend', async () => {
  const api = {
    getNode: async (_wid: string, id: string) => {
      const index = Number(id.slice(7))
      return folderFixture(id, index ? `folder-${index - 1}` : null)
    },
  }
  const path = await getFolderPath(api, 'workspace', 'folder-63')
  assert.equal(path.length, 64)
  assert.equal(path[0]?.id, 'folder-0')
  assert.equal(path.at(-1)?.id, 'folder-63')
  await assert.rejects(getFolderPath(api, 'workspace', 'folder-64'), /64/)
  assert.deepEqual(await getFolderPath(api, 'workspace', null), [])
})

test('folder location rejects cycles, unrelated workspace results, files, and cancelled traversal', async () => {
  await assert.rejects(
    getFolderPath({ getNode: async () => folderFixture('cycle', 'cycle') }, 'workspace', 'cycle'),
    /geçersiz/,
  )
  await assert.rejects(
    getFolderPath(
      { getNode: async () => folderFixture('folder', null, { workspaceId: 'other-workspace' }) },
      'workspace',
      'folder',
    ),
    /çalışma alanı/,
  )
  await assert.rejects(
    getFolderPath(
      { getNode: async () => folderFixture('file', null, { kind: 'file' }) },
      'workspace',
      'file',
    ),
    /klasörüne/,
  )
  let reads = 0
  await assert.rejects(
    getFolderPath(
      {
        getNode: async () => {
          reads++
          return folderFixture('folder', null)
        },
      },
      'workspace',
      'folder',
      { signal: AbortSignal.abort() },
    ),
    { name: 'AbortError' },
  )
  assert.equal(reads, 0)
  const controller = new AbortController()
  await assert.rejects(
    getFolderPath(
      {
        getNode: async () => {
          controller.abort()
          return folderFixture('folder', null)
        },
      },
      'workspace',
      'folder',
      { signal: controller.signal },
    ),
    { name: 'AbortError' },
  )
})
