import assert from 'node:assert/strict'
import test from 'node:test'
import { computed, ref } from 'vue'
import { useDrive } from '../app/composables/useDrive.ts'
import { ApiError } from '../app/services/api-error.ts'
import type { DriveApi } from '../app/services/drive-api.ts'
import type { DriveNode, Session, User, Workspace } from '../shared/types.ts'

const userA: User = { id: 'user-a', name: 'A', email: 'a@example.com', emailVerified: true }
const userB: User = { id: 'user-b', name: 'B', email: 'b@example.com', emailVerified: true }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** Run the actual composable with only its Nuxt framework bindings replaced. */
function fixture(api: Partial<DriveApi>, initialUser: User | null = userA) {
  const state = new Map<string, ReturnType<typeof ref>>()
  state.set('drive-user', ref(initialUser))
  state.set('drive-initialized', ref(initialUser !== null))
  const navigations: unknown[] = []
  const notifications: string[] = []
  const route = ref({
    path: '/workspaces/workspace-a/files',
    fullPath: '/workspaces/workspace-a/files?folder=documents',
  })
  const bindings = {
    computed,
    useNuxtApp: () => ({ $driveApi: api }),
    useRuntimeConfig: () => ({ public: { dataMode: 'http', apiBase: '/api/v1' } }),
    useRouter: () => ({
      currentRoute: route,
      push: async (to: unknown) => {
        navigations.push(to)
      },
      replace: async (to: unknown) => {
        navigations.push(to)
      },
    }),
    useState: (key: string, initialize: () => unknown) => {
      if (!state.has(key)) state.set(key, ref(initialize()))
      return state.get(key)
    },
    useNotify: () => ({
      notify: (message: string) => {
        notifications.push(message)
      },
    }),
  }
  const global = globalThis as unknown as Record<string, unknown>
  const previous = new Map(
    Object.keys(bindings).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  )
  for (const [key, value] of Object.entries(bindings)) global[key] = value
  const restore = () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete global[key]
    }
  }
  return { drive: useDrive(), state, route, navigations, notifications, restore }
}

function captureGoogleWindow(t: { after(callback: () => void): void }) {
  const assigned: string[] = []
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { assign: (url: string) => assigned.push(url) } },
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else delete (globalThis as unknown as Record<string, unknown>).window
  })
  return assigned
}

test('Google sign-in sends pending invitation in the API body and navigates only to Google', async (t) => {
  const assigned = captureGoogleWindow(t),
    token = 'a'.repeat(43)
  let input: unknown
  const setup = fixture(
    {
      getAuthProviders: async () => ({ google: true }),
      startGoogleSignIn: async (body) => {
        input = body
        return { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque' }
      },
    },
    null,
  )
  t.after(setup.restore)
  setup.state.get('pending-invitation-token')!.value = token
  await setup.drive.googleSignIn('/invitations/accept')
  assert.deepEqual(input, { returnTo: '/invitations/accept', invitationToken: token })
  assert.deepEqual(assigned, ['https://accounts.google.com/o/oauth2/v2/auth?state=opaque'])
  assert.ok(!assigned[0]!.includes(token))
})

test('a delayed Google provider response cannot start login for a replacement session', async (t) => {
  const assigned = captureGoogleWindow(t),
    providers = deferred<{ google: boolean }>()
  let started = false
  const setup = fixture(
    {
      getAuthProviders: () => providers.promise,
      login: async () => ({ user: userB }),
      startGoogleSignIn: async () => {
        started = true
        return { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth' }
      },
    },
    null,
  )
  t.after(setup.restore)
  const pending = setup.drive.googleSignIn()
  await setup.drive.signIn({ email: userB.email, password: 'test-password' })
  providers.resolve({ google: true })
  await pending
  assert.equal(started, false)
  assert.deepEqual(assigned, [])
})

test('replaced invitation context cannot navigate a delayed Google start', async (t) => {
  const assigned = captureGoogleWindow(t),
    result = deferred<{ authorizationUrl: string }>(),
    started = deferred<void>()
  const setup = fixture(
    {
      getAuthProviders: async () => ({ google: true }),
      startGoogleSignIn: async () => {
        started.resolve()
        return result.promise
      },
    },
    null,
  )
  t.after(setup.restore)
  setup.state.get('pending-invitation-token')!.value = 'a'.repeat(43)
  const pending = setup.drive.googleSignIn('/invitations/accept')
  await started.promise
  setup.state.get('pending-invitation-token')!.value = 'b'.repeat(43)
  result.resolve({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth' })
  await pending
  assert.deepEqual(assigned, [])
})

test('Google start rejects an unexpected authorization destination', async (t) => {
  const assigned = captureGoogleWindow(t)
  const setup = fixture(
    {
      getAuthProviders: async () => ({ google: true }),
      startGoogleSignIn: async () => ({ authorizationUrl: 'https://attacker.example/collect' }),
    },
    null,
  )
  t.after(setup.restore)
  await assert.rejects(setup.drive.googleSignIn(), /Google ile giriş başlatılamadı/)
  assert.deepEqual(assigned, [])
})

for (const replacement of [userA, userB]) {
  for (const stage of ['acceptance', 'list refresh']) {
    test(`invitation ${stage} cannot finish in a replacement ${replacement === userA ? 'session' : 'account'}`, async (t) => {
      const result = deferred<Workspace>(),
        page = deferred<{ items: Workspace[]; nextCursor: string | null }>(),
        started = deferred<void>()
      let listReads = 0
      const setup = fixture({
        acceptInvitation: () =>
          stage === 'acceptance'
            ? result.promise
            : Promise.resolve(workspace('viewer', 'invited-workspace')),
        listWorkspacesPage: () => {
          listReads++
          started.resolve()
          return page.promise
        },
        login: async () => ({ user: replacement }),
      })
      t.after(setup.restore)
      const pending = setup.drive.acceptInvitation('pending-invitation')
      const rejected = assert.rejects(pending, /Oturum değişti/)
      if (stage === 'list refresh') await started.promise
      await setup.drive.signIn({ email: replacement.email, password: 'New-session' })
      setup.drive.workspaces.value = [workspace('owner', 'current-workspace')]
      result.resolve(workspace('viewer', 'invited-workspace'))
      page.resolve({ items: [workspace('viewer', 'invited-workspace')], nextCursor: null })
      await rejected
      assert.deepEqual(
        setup.drive.workspaces.value.map((item) => item.id),
        ['current-workspace'],
      )
      assert.equal(listReads, stage === 'acceptance' ? 0 : 1)
      assert.deepEqual(setup.notifications, [])
      assert.deepEqual(setup.navigations, [])
    })
  }
}

test('accepted invitation still returns its workspace when the current session list refresh fails', async (t) => {
  const invited = workspace('viewer', 'invited-workspace')
  const setup = fixture({
    acceptInvitation: async () => invited,
    listWorkspacesPage: async () => {
      throw new Error('Temporary list failure')
    },
  })
  t.after(setup.restore)
  assert.deepEqual(await setup.drive.acceptInvitation('pending-invitation'), invited)
  assert.equal(setup.notifications.length, 1)
  assert.deepEqual(setup.navigations, [])
})

for (const replacement of [userB, userA]) {
  test(`a delayed 401 cannot sign out a replacement ${replacement === userA ? 'session for the same identity' : 'account'}`, async (t) => {
    const response = deferred<DriveNode[]>()
    const setup = fixture({
      listNodes: () => response.promise,
      login: async () => ({ user: replacement }),
    })
    t.after(setup.restore)
    const request = setup.drive.api.listNodes('workspace-a')
    const rejection = assert.rejects(
      request,
      (error) => error instanceof ApiError && error.status === 401,
    )
    await setup.drive.signIn({ email: replacement.email, password: 'Test-password' })
    setup.drive.workspaces.value = [{ id: 'new-session-workspace' } as Workspace]
    response.reject(new ApiError(401, 'UNAUTHENTICATED', 'Old session expired.'))
    await rejection
    assert.equal(setup.drive.user.value?.id, replacement.id)
    assert.equal(setup.drive.workspaces.value[0]?.id, 'new-session-workspace')
    assert.deepEqual(setup.navigations, [])
    assert.deepEqual(setup.notifications, [])
  })
}

test('a delayed initial session read cannot replace a newer successful sign-in', async (t) => {
  const bootstrap = deferred<Session | null>()
  const setup = fixture(
    { getSession: () => bootstrap.promise, login: async () => ({ user: userB }) },
    null,
  )
  t.after(setup.restore)
  const initialize = setup.drive.initialize()
  await setup.drive.signIn({ email: userB.email, password: 'Test-password' })
  bootstrap.resolve({ user: userA })
  await initialize
  assert.equal(setup.drive.user.value?.id, userB.id)
  assert.equal(setup.drive.initialized.value, true)
})

test('a 401 from the current session still clears tenant state while retaining its pending invitation', async (t) => {
  const setup = fixture({
    listNodes: async () => {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Session expired.')
    },
  })
  t.after(setup.restore)
  setup.drive.workspaces.value = [{ id: 'workspace-a' } as Workspace]
  setup.state.get('pending-invitation-token')!.value = 'pending-link'
  await assert.rejects(
    setup.drive.api.listNodes('workspace-a'),
    (error) => error instanceof ApiError && error.status === 401,
  )
  assert.equal(setup.drive.user.value, null)
  assert.deepEqual(setup.drive.workspaces.value, [])
  assert.equal(setup.state.get('pending-invitation-token')!.value, 'pending-link')
  assert.deepEqual(setup.navigations, [
    { path: '/login', query: { returnTo: '/workspaces/workspace-a/files?folder=documents' } },
  ])
  assert.equal(setup.notifications.length, 1)
})

test('password reset clears identity and tenant state before login while retaining only pending link memory', async (t) => {
  const setup = fixture({ confirmPasswordReset: async () => {} })
  t.after(setup.restore)
  setup.drive.workspaces.value = [{ id: 'old-workspace' } as Workspace]
  setup.state.get('pending-invitation-token')!.value = 'pending-link'
  setup.state.get('pending-password-reset-token')!.value = 'reset-link'
  await setup.drive.resetPassword({ token: 'reset-link', password: 'New-password' })
  assert.equal(setup.drive.user.value, null)
  assert.deepEqual(setup.drive.workspaces.value, [])
  assert.equal(setup.state.get('pending-password-reset-token')!.value, '')
  assert.equal(setup.state.get('pending-invitation-token')!.value, 'pending-link')
  assert.deepEqual(setup.navigations, [
    { path: '/login', query: { passwordReset: 'success', returnTo: '/invitations/accept' } },
  ])
})

function workspace(role: Workspace['role'] = 'owner', id = 'workspace-a'): Workspace {
  return {
    id,
    name: 'Test workspace',
    description: '',
    color: '#4285f4',
    role,
    capabilities:
      role === 'owner'
        ? [
            'workspace:read',
            'workspace:update',
            'members:read',
            'audit:read',
            'content:read',
            'content:create',
          ]
        : ['workspace:read', 'content:read'],
    memberCount: 2,
    storageUsed: 0,
    storageLimit: 1024,
    createdAt: new Date().toISOString(),
  }
}

for (const page of ['members', 'settings', 'activity', 'files']) {
  test(`focus revalidates an unchanged account's role and closes stale ${page} state`, async (t) => {
    let reads = 0
    const viewer = workspace('viewer')
    const setup = fixture({
      getSession: async () => ({ user: userA }),
      getWorkspace: async (id) => {
        reads++
        assert.equal(id, viewer.id)
        return viewer
      },
    })
    t.after(setup.restore)
    setup.route.value = {
      path: `/workspaces/workspace-a/${page}`,
      fullPath: `/workspaces/workspace-a/${page}`,
    }
    setup.drive.currentWorkspace.value = workspace()
    setup.drive.workspaces.value = [workspace()]
    setup.drive.command.value = 'upload'
    const revision = setup.drive.workspaceAccessRevision.value
    await setup.drive.refreshSession()
    assert.equal(reads, 1)
    assert.equal(setup.drive.currentWorkspace.value?.role, 'viewer')
    assert.equal(setup.drive.workspaces.value[0]?.role, 'viewer')
    assert.equal(setup.drive.command.value, null)
    assert.equal(
      setup.drive.workspaceAccessRevision.value,
      revision + 1,
      'page key changes so old dialogs and requests are disposed',
    )
    assert.deepEqual(setup.navigations, page === 'files' ? [] : ['/workspaces/workspace-a/files'])
  })
}

for (const status of [403, 404]) {
  test(`focus clears an inaccessible workspace (${status}) and returns to the workspace directory`, async (t) => {
    const setup = fixture({
      getSession: async () => ({ user: userA }),
      getWorkspace: async () => {
        throw new ApiError(status, 'FORBIDDEN', 'No access')
      },
    })
    t.after(setup.restore)
    setup.drive.currentWorkspace.value = workspace()
    setup.drive.workspaces.value = [workspace(), workspace('viewer', 'workspace-b')]
    setup.drive.workspaceNextCursor.value = 'old-directory-cursor'
    setup.drive.search.value = 'Private query'
    const revision = setup.drive.workspaceAccessRevision.value
    await setup.drive.refreshSession()
    assert.equal(setup.drive.user.value?.id, userA.id)
    assert.equal(setup.drive.currentWorkspace.value, null)
    assert.deepEqual(
      setup.drive.workspaces.value.map((item) => item.id),
      ['workspace-b'],
    )
    assert.equal(setup.drive.workspaceNextCursor.value, null)
    assert.equal(setup.drive.search.value, '')
    assert.equal(setup.drive.workspaceAccessRevision.value, revision + 1)
    assert.deepEqual(setup.navigations, ['/workspaces'])
  })
}

test('unchanged permissions update metadata without disposing the current view and coalesce focus events', async (t) => {
  const metadata = deferred<Workspace>()
  let sessionReads = 0,
    workspaceReads = 0
  const setup = fixture({
    getSession: async () => {
      sessionReads++
      return { user: userA }
    },
    getWorkspace: () => {
      workspaceReads++
      return metadata.promise
    },
  })
  t.after(setup.restore)
  setup.drive.currentWorkspace.value = workspace()
  const revision = setup.drive.workspaceAccessRevision.value
  const first = setup.drive.refreshSession(),
    second = setup.drive.refreshSession()
  assert.equal(first, second)
  metadata.resolve({
    ...workspace(),
    name: 'Updated name',
    capabilities: [...workspace().capabilities].reverse(),
  })
  await first
  assert.equal(sessionReads, 1)
  assert.equal(workspaceReads, 1)
  assert.equal(setup.drive.currentWorkspace.value?.name, 'Updated name')
  assert.equal(setup.drive.workspaceAccessRevision.value, revision)
  assert.deepEqual(setup.navigations, [])
})

test('a delayed focus role response cannot replace a newer active workspace', async (t) => {
  const old = deferred<Workspace>()
  const started = deferred<void>()
  const setup = fixture({
    getSession: async () => ({ user: userA }),
    getWorkspace: (id) => {
      if (id === 'workspace-a') {
        started.resolve()
        return old.promise
      }
      return Promise.resolve(workspace('viewer', id))
    },
  })
  t.after(setup.restore)
  setup.drive.currentWorkspace.value = workspace()
  const refresh = setup.drive.refreshSession()
  await started.promise
  await setup.drive.activateWorkspace('workspace-b')
  const revision = setup.drive.workspaceAccessRevision.value
  old.resolve(workspace('viewer'))
  await refresh
  assert.equal(setup.drive.currentWorkspace.value?.id, 'workspace-b')
  assert.equal(setup.drive.workspaceAccessRevision.value, revision)
  assert.deepEqual(setup.navigations, [])
})

for (const replacement of [userA, userB]) {
  test(`a delayed focus rejection cannot clear a newer ${replacement === userA ? 'session of the same account' : 'account'}`, async (t) => {
    const old = deferred<Workspace>(),
      started = deferred<void>()
    const setup = fixture({
      getSession: async () => ({ user: userA }),
      getWorkspace: () => {
        started.resolve()
        return old.promise
      },
      login: async () => ({ user: replacement }),
    })
    t.after(setup.restore)
    setup.drive.currentWorkspace.value = workspace()
    const refresh = setup.drive.refreshSession()
    await started.promise
    await setup.drive.signIn({ email: replacement.email, password: 'New-session' })
    setup.drive.currentWorkspace.value = workspace('viewer', 'workspace-b')
    const revision = setup.drive.workspaceAccessRevision.value
    old.reject(new ApiError(404, 'NOT_FOUND', 'Old workspace removed'))
    await refresh
    assert.equal(setup.drive.user.value?.id, replacement.id)
    assert.equal(setup.drive.currentWorkspace.value?.id, 'workspace-b')
    assert.equal(setup.drive.workspaceAccessRevision.value, revision)
    assert.deepEqual(setup.navigations, [])
  })
}

test('temporary workspace refresh failure keeps the view and a real session expiry still signs out', async (t) => {
  let status = 0
  const setup = fixture({
    getSession: async () => ({ user: userA }),
    getWorkspace: async () => {
      throw new ApiError(status, 'UNAVAILABLE', 'Temporarily unavailable')
    },
  })
  t.after(setup.restore)
  setup.drive.currentWorkspace.value = workspace()
  const revision = setup.drive.workspaceAccessRevision.value
  await assert.rejects(
    setup.drive.refreshSession(),
    (error) => error instanceof ApiError && error.status === 0,
  )
  assert.equal(setup.drive.currentWorkspace.value?.role, 'owner')
  assert.equal(setup.drive.workspaceAccessRevision.value, revision)
  status = 401
  await setup.drive.refreshSession()
  assert.equal(setup.drive.user.value, null)
  assert.equal(setup.drive.currentWorkspace.value, null)
  assert.deepEqual(setup.navigations, [
    { path: '/login', query: { returnTo: '/workspaces/workspace-a/files?folder=documents' } },
  ])
})
