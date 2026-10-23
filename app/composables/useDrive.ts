import type { DriveApi } from '~/services/drive-api'
import type { LoginInput, RegisterInput, Session, User, Workspace } from '../../shared/types'
import { resolveDataMode } from '../../shared/runtime-config.ts'

export function useDrive() {
  const nuxt = useNuxtApp()
  const router = useRouter()
  const config = useRuntimeConfig()
  const rawApi = nuxt.$driveApi as DriveApi
  const user = useState<User | null>('drive-user', () => null)
  const initialized = useState('drive-initialized', () => false)
  const initializationError = useState('drive-initialization-error', () => '')
  const workspaces = useState<Workspace[]>('drive-workspaces', () => [])
  const workspaceNextCursor = useState<string | null>('drive-workspaces-cursor', () => null)
  const workspaceLoadingMore = useState('drive-workspaces-loading-more', () => false)
  const workspacePageError = useState('drive-workspaces-page-error', () => '')
  const workspaceListGeneration = useState('drive-workspaces-list-generation', () => 0)
  const currentWorkspace = useState<Workspace | null>('drive-current-workspace', () => null)
  const search = useState('drive-search', () => '')
  const command = useState<'folder' | 'upload' | null>('drive-command', () => null)
  const pendingInvitation = useState<string | null>('pending-invitation-token', () => null)
  const pendingVerification = useState<string>('pending-verification-token', () => '')
  const pendingReset = useState<string>('pending-password-reset-token', () => '')
  const workspaceGeneration = useState('drive-workspace-generation', () => 0)
  const workspaceAccessRevision = useState('drive-workspace-access-revision', () => 0)
  const sessionGeneration = useState('drive-session-generation', () => 0)
  const mode = computed(() => resolveDataMode(config.public.dataMode))
  const { notify } = useNotify()
  let refreshRequest: Promise<void> | null = null

  function clearSession(preservePending = false) {
    sessionGeneration.value++
    user.value = null
    currentWorkspace.value = null
    workspaces.value = []
    workspaceNextCursor.value = null; workspaceLoadingMore.value = false; workspacePageError.value = ''; workspaceListGeneration.value++
    search.value = ''
    command.value = null
    workspaceGeneration.value++
    workspaceAccessRevision.value++
    if (!preservePending) { pendingInvitation.value = null; pendingVerification.value = ''; pendingReset.value = '' }
  }
  async function request<T>(action: () => Promise<T>): Promise<T> {
    const revision = sessionGeneration.value
    const identity = user.value?.id
    try { return await action() }
    catch (error) {
      const status = (error as { status?: number }).status
      if (status === 401 && user.value && revision === sessionGeneration.value && identity === user.value.id) {
        const returnTo = router.currentRoute.value.fullPath
        clearSession(true)
        notify('Oturumun sona erdi. Yeniden giriş yap.', 'info')
        void router.push({ path: '/login', query: { returnTo } })
      }
      throw error
    }
  }
  const api = new Proxy(rawApi, {
    get(target, key) {
      const member = target[key as keyof DriveApi]
      if (typeof member !== 'function') return member
      return (...args: unknown[]) => request(() => (member as (...values: unknown[]) => Promise<unknown>).apply(target, args))
    },
  }) as DriveApi

  async function initialize() {
    if (initialized.value) return
    const revision = sessionGeneration.value
    try {
      const session = await rawApi.getSession()
      if (revision === sessionGeneration.value) { user.value = session?.user ?? null; initializationError.value = '' }
    }
    catch (error) { if (revision === sessionGeneration.value) initializationError.value = error instanceof Error ? error.message : 'Oturum bilgisi alınamadı.' }
    finally { if (revision === sessionGeneration.value) initialized.value = true }
  }
  function refreshSession(): Promise<void> {
    // Focus and visibility often arrive together. Share the read without polling.
    if (refreshRequest) return refreshRequest
    const revision = sessionGeneration.value
    refreshRequest = (async () => {
      const next = (await rawApi.getSession())?.user ?? null
      if (revision !== sessionGeneration.value) return
      initializationError.value = ''
      initialized.value = true
      if (next?.id !== user.value?.id) {
        const returnTo = router.currentRoute.value.fullPath
        clearSession(true)
        user.value = next
        if (router.currentRoute.value.path.startsWith('/workspaces') || router.currentRoute.value.path === '/account') {
          await router.replace(next
            ? next.emailVerified ? '/workspaces' : { path: '/verify-email', query: { returnTo } }
            : { path: '/login', query: { returnTo } })
        }
      } else {
        user.value = next
        if (next && !next.emailVerified && (router.currentRoute.value.path.startsWith('/workspaces') || router.currentRoute.value.path === '/account')) {
          await router.replace({ path: '/verify-email', query: { returnTo: router.currentRoute.value.fullPath } })
        } else if (next?.emailVerified) {
          await refreshWorkspaceAccess(revision, next.id)
        }
      }
    })().finally(() => { refreshRequest = null })
    return refreshRequest
  }
  async function refreshWorkspaceAccess(revision: number, identity: string) {
    const scope = currentWorkspace.value?.id
    if (!scope) return
    const generation = ++workspaceGeneration.value
    const isCurrent = () => revision === sessionGeneration.value && user.value?.id === identity && generation === workspaceGeneration.value && currentWorkspace.value?.id === scope
    const root = `/workspaces/${encodeURIComponent(scope)}`
    try {
      const updated = await api.getWorkspace(scope)
      if (!isCurrent()) return
      const previous = currentWorkspace.value!
      const accessChanged = previous.role !== updated.role || [...previous.capabilities].sort().join(',') !== [...updated.capabilities].sort().join(',')
      currentWorkspace.value = updated
      const index = workspaces.value.findIndex(item => item.id === scope)
      if (index >= 0) workspaces.value[index] = updated
      if (accessChanged) { command.value = null; workspaceAccessRevision.value++ }
      const path = router.currentRoute.value.path
      const required = path === `${root}/members` ? 'members:read' : path === `${root}/settings` ? 'workspace:update' : path === `${root}/activity` ? 'audit:read' : null
      if (required && !updated.capabilities.includes(required)) await router.replace(`${root}/files`)
    } catch (cause) {
      if (!isCurrent()) return
      const status = (cause as { status?: number }).status
      if (status !== 403 && status !== 404) throw cause
      currentWorkspace.value = null
      workspaceGeneration.value++; workspaceAccessRevision.value++
      workspaces.value = workspaces.value.filter(item => item.id !== scope)
      workspaceNextCursor.value = null; workspaceLoadingMore.value = false; workspacePageError.value = ''; workspaceListGeneration.value++
      search.value = ''; command.value = null
      const path = router.currentRoute.value.path
      if (path === root || path.startsWith(`${root}/`)) {
        notify('Bu çalışma alanına erişimin sona erdi.', 'info')
        await router.replace('/workspaces')
      }
    }
  }
  async function refreshWorkspaces() {
    const identity = user.value?.id
    const generation = ++workspaceListGeneration.value
    workspacePageError.value = ''; workspaceLoadingMore.value = false
    const result = await api.listWorkspacesPage({ limit: 50 })
    if (identity && user.value?.id === identity && generation === workspaceListGeneration.value) { workspaces.value = result.items; workspaceNextCursor.value = result.nextCursor }
    return result.items
  }
  async function loadMoreWorkspaces() {
    if (!workspaceNextCursor.value || workspaceLoadingMore.value) return
    const identity = user.value?.id, generation = workspaceListGeneration.value, cursor = workspaceNextCursor.value
    workspaceLoadingMore.value = true; workspacePageError.value = ''
    try {
      const page = await api.listWorkspacesPage({ limit: 50, cursor })
      if (!identity || identity !== user.value?.id || generation !== workspaceListGeneration.value) return
      workspaces.value = [...new Map([...workspaces.value, ...page.items].map(workspace => [workspace.id, workspace])).values()]
      workspaceNextCursor.value = page.nextCursor
    } catch (cause) { if (generation === workspaceListGeneration.value) workspacePageError.value = cause instanceof Error ? cause.message : 'Diğer alanlar yüklenemedi.'; throw cause }
    finally { if (generation === workspaceListGeneration.value) workspaceLoadingMore.value = false }
  }
  async function activateWorkspace(id: string) {
    const generation = ++workspaceGeneration.value
    if (currentWorkspace.value?.id !== id) { currentWorkspace.value = null; search.value = ''; command.value = null }
    const result = await api.getWorkspace(id)
    if (generation !== workspaceGeneration.value) return result
    currentWorkspace.value = result
    const index = workspaces.value.findIndex(item => item.id === id)
    if (index >= 0) workspaces.value[index] = result
    else workspaces.value.push(result)
    return result
  }
  function acceptSession(session: Session) {
    sessionGeneration.value++
    workspaceGeneration.value++
    workspaceAccessRevision.value++
    user.value = session.user
    initialized.value = true
    initializationError.value = ''
    currentWorkspace.value = null
    workspaces.value = []
    workspaceNextCursor.value = null; workspaceLoadingMore.value = false; workspacePageError.value = ''; workspaceListGeneration.value++
  }
  async function signIn(input: LoginInput) { acceptSession(await rawApi.login(input)) }
  async function signUp(input: RegisterInput) { acceptSession(await rawApi.register(input)) }
  async function verifyEmail(token: string) { acceptSession(await rawApi.verifyEmail({ token })) }
  async function resetPassword(input: { token: string; password: string }) {
    await rawApi.confirmPasswordReset(input)
    const returnTo = pendingInvitation.value ? '/invitations/accept' : '/workspaces'
    clearSession(true); pendingReset.value = ''
    await router.replace({ path: '/login', query: { passwordReset: 'success', returnTo } })
  }
  async function signOut() {
    await rawApi.logout()
    clearSession()
    await router.push('/login')
  }
  async function switchAccount(returnTo: string) {
    await rawApi.logout()
    // An explicit account switch on a token page keeps only the pending links in memory.
    clearSession(true)
    await router.push({ path: '/login', query: { returnTo } })
  }
  async function googleSignIn(returnTo = '/workspaces') {
    if (mode.value === 'demo') { notify('Google ile giriş, gerçek backend bağlandığında kullanılabilecek.', 'info'); return }
    const revision = sessionGeneration.value
    const destination = /^\/(?!\/)/.test(returnTo) && !/[\\\u0000-\u0020\u007f]/.test(returnTo) ? returnTo : '/workspaces'
    const invitationToken = destination === '/invitations/accept' ? pendingInvitation.value || undefined : undefined
    const isCurrent = () => revision === sessionGeneration.value && (destination !== '/invitations/accept' || invitationToken === (pendingInvitation.value || undefined))
    const providers = await rawApi.getAuthProviders()
    if (!isCurrent()) return
    if (!providers.google) { notify('Google ile giriş henüz kullanıma açılmadı. E-posta adresin ve şifrenle devam edebilirsin.', 'info'); return }
    const result = await rawApi.startGoogleSignIn({ returnTo: destination, ...(invitationToken ? { invitationToken } : {}) })
    if (!isCurrent()) return
    const authorization = new URL(result.authorizationUrl)
    if (authorization.origin !== 'https://accounts.google.com' || authorization.pathname !== '/o/oauth2/v2/auth') throw new Error('Google ile giriş başlatılamadı.')
    window.location.assign(authorization.href)
  }
  return {
    user, mode, initialized, initializationError, workspaces, workspaceNextCursor, workspaceLoadingMore, workspacePageError, currentWorkspace, workspaceAccessRevision, search, command, api, sessionRevision: computed(() => sessionGeneration.value),
    initialize, refreshSession, refreshWorkspaces, loadMoreWorkspaces, activateWorkspace, signIn, signUp, verifyEmail, resetPassword, signOut, switchAccount, googleSignIn,
    resendVerification: () => api.resendVerification(),
    inspectInvitation: (token: string) => api.inspectInvitation(token),
    async acceptInvitation(token: string) {
      const workspace = await api.acceptInvitation(token)
      try { await refreshWorkspaces() } catch { notify('Davet kabul edildi. Çalışma alanı listesi daha sonra yenilenecek.', 'info') }
      return workspace
    },
  }
}
