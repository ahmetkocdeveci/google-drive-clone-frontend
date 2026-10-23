import type { ApiOptions, ArchiveJob, ArchiveOptions, ContentDownload, DriveNode, NodeQuery, PageQuery, Session } from '../../shared/types.ts'
import type { DriveApi } from './drive-api.ts'
import { ApiError } from './api-error.ts'

export interface HttpDriveApiOptions { baseUrl?: string; fetch?: typeof globalThis.fetch }

/** Backend DTO contract. Cookies are sent only to the configured API. */
export function createHttpDriveApi(config: HttpDriveApiOptions = {}): DriveApi {
  const baseUrl = (config.baseUrl ?? '/api/v1').replace(/\/$/, '')
  const fetcher = config.fetch ?? globalThis.fetch.bind(globalThis)
  let csrfToken: string | null = null
  let csrfRequest: Promise<string> | null = null
  const path = (value: string) => encodeURIComponent(value)
  const ws = (wid: string) => `/workspaces/${path(wid)}`

  async function safeFetch(input: string, init: RequestInit): Promise<Response> {
    try { return await fetcher(input, init) }
    catch (error) {
      if (init.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
      throw new ApiError(0, 'NETWORK_ERROR', 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.')
    }
  }
  function waitForToken(promise: Promise<string>, signal?: AbortSignal): Promise<string> {
    if (!signal) return promise
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const cancel = () => { signal.removeEventListener('abort', cancel); reject(signal.reason) }
      signal.addEventListener('abort', cancel, { once: true })
      promise.then(value => { signal.removeEventListener('abort', cancel); resolve(value) }, error => { signal.removeEventListener('abort', cancel); reject(error) })
    })
  }

  async function responseError(response: Response): Promise<never> {
    let detail: { code?: string; message?: string } = {}
    try {
      const body = await response.json() as unknown
      if (body && typeof body === 'object') {
        const data = body as { error?: unknown; code?: unknown; message?: unknown }
        const candidate = data.error && typeof data.error === 'object' ? data.error as { code?: unknown; message?: unknown } : data
        detail = { code: typeof candidate.code === 'string' ? candidate.code : undefined, message: typeof candidate.message === 'string' ? candidate.message : undefined }
      }
    } catch { /* An HTML gateway response must not be rendered as a server message. */ }
    if (response.status === 401 || detail.code === 'CSRF_INVALID') csrfToken = null
    throw new ApiError(response.status, detail.code || `HTTP_${response.status}`, detail.message || (response.status === 401 ? 'Devam etmek için giriş yap.' : 'İstek tamamlanamadı. Lütfen tekrar dene.'))
  }
  async function getCsrfToken(options?: ApiOptions): Promise<string> {
    options?.signal?.throwIfAborted()
    if (csrfToken) return csrfToken
    if (!csrfRequest) {
      // This request is shared; one view's cancellation must not cancel unrelated mutations.
      csrfRequest = (async () => {
        const response = await safeFetch(`${baseUrl}/auth/csrf-token`, { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' })
        if (!response.ok) return responseError(response)
        const body = await response.json() as { csrfToken?: string }
        if (!body.csrfToken) throw new ApiError(502, 'CSRF_TOKEN_MISSING', 'Güvenli istek anahtarı alınamadı.')
        csrfToken = body.csrfToken
        return csrfToken
      })().finally(() => { csrfRequest = null })
    }
    const token = await waitForToken(csrfRequest, options?.signal)
    options?.signal?.throwIfAborted()
    return token
  }
  async function raw(endpoint: string, method = 'GET', body?: unknown, options?: ApiOptions, accept = 'application/json', retryCsrf = true): Promise<Response> {
    options?.signal?.throwIfAborted()
    const headers: Record<string, string> = { Accept: accept }
    if (!['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = await getCsrfToken(options)
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await safeFetch(`${baseUrl}${endpoint}`, { method, headers, credentials: 'include', signal: options?.signal, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) })
    if (!response.ok) {
      try { return await responseError(response) }
      catch (error) {
        // This explicit rejection happens before the backend mutation handler.
        if (retryCsrf && error instanceof ApiError && error.code === 'CSRF_INVALID' && !['GET', 'HEAD'].includes(method)) return raw(endpoint, method, body, options, accept, false)
        throw error
      }
    }
    return response
  }
  async function request<T>(endpoint: string, method = 'GET', body?: unknown, options?: ApiOptions): Promise<T> {
    const response = await raw(endpoint, method, body, options)
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
  async function content(endpoint: string, fallback: string, options?: ApiOptions): Promise<ContentDownload> {
    const response = await raw(endpoint, 'GET', undefined, options, '*/*')
    let blob: Blob
    try { blob = await response.blob() }
    catch (error) {
      options?.signal?.throwIfAborted()
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new ApiError(0, 'DOWNLOAD_INTERRUPTED', 'İndirme kesildi. Bağlantını ve çalışma alanına erişimini kontrol edip yeniden dene.')
    }
    const disposition = response.headers.get('Content-Disposition') || ''
    let filename = fallback
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)
    const quoted = disposition.match(/filename="([^"]+)"/i)
    try { filename = encoded ? decodeURIComponent(encoded[1]!) : quoted?.[1] || fallback } catch { /* Keep a usable fallback for malformed headers. */ }
    filename = filename.replace(/[\\/\x00-\x1f]/g, '_')
    return { blob, filename, mimeType: blob.type || 'application/octet-stream' }
  }
  function queryString(query: NodeQuery & PageQuery = {}): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, value === null ? 'root' : String(value))
    const value = params.toString()
    return value ? `?${value}` : ''
  }

  return {
    async getAuthProviders(options) { return request('/auth/providers', 'GET', undefined, options) },
    async getAuthIdentities(options) { return request('/auth/identities', 'GET', undefined, options) },
    async startGoogleLink(input, options) { return request('/auth/google/link/start', 'POST', input, options) },
    async requestPasswordReset(input, options) { await raw('/auth/password-reset/request', 'POST', input, options) },
    async confirmPasswordReset(input, options) { await raw('/auth/password-reset/confirm', 'POST', input, options); csrfToken = null },
    async getSession(options) {
      try { return await request<Session>('/auth/me', 'GET', undefined, options) }
      catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error }
    },
    async login(input, options) { const session = await request<Session>('/auth/login', 'POST', input, options); csrfToken = null; return session },
    async register(input, options) { const session = await request<Session>('/auth/register', 'POST', input, options); csrfToken = null; return session },
    async logout(options) { await request<void>('/auth/logout', 'POST', undefined, options); csrfToken = null },
    async verifyEmail(input, options) { return request('/auth/email-verification/confirm', 'POST', input, options) },
    async resendVerification(options) { await request<void>('/auth/email-verification/resend', 'POST', undefined, options) },
    async listWorkspaces(options) { return request('/workspaces', 'GET', undefined, options) },
    async listWorkspacesPage(query, options) { return request(`/workspaces/page${queryString(query)}`, 'GET', undefined, options) },
    async createWorkspace(input, options) { return request('/workspaces', 'POST', input, options) },
    async getWorkspace(wid, options) { return request(ws(wid), 'GET', undefined, options) },
    async updateWorkspace(wid, input, options) { return request(ws(wid), 'PATCH', input, options) },
    async deleteWorkspace(wid, options) { await request<void>(ws(wid), 'DELETE', undefined, options) },
    async listNodes(wid, query, options) { return request(`${ws(wid)}/nodes${queryString(query)}`, 'GET', undefined, options) },
    async listNodesPage(wid, query, options) { return request(`${ws(wid)}/nodes/page${queryString(query)}`, 'GET', undefined, options) },
    async getNode(wid, nid, options) { return request(`${ws(wid)}/nodes/${path(nid)}`, 'GET', undefined, options) },
    async createFolder(wid, input, options) { return request(`${ws(wid)}/folders`, 'POST', input, options) },
    async updateNode(wid, nid, input, options) { return request(`${ws(wid)}/nodes/${path(nid)}`, 'PATCH', input, options) },
    async deleteNodes(wid, ids, options) {
      // Individual API deletes are intentional: no undocumented global bulk endpoint.
      for (const nid of ids) await request<void>(`${ws(wid)}/nodes/${path(nid)}`, 'DELETE', undefined, options)
    },
    async listMembers(wid, options) { return request(`${ws(wid)}/members`, 'GET', undefined, options) },
    async listMembersPage(wid, query, options) { return request(`${ws(wid)}/members/page${queryString(query)}`, 'GET', undefined, options) },
    async changeMemberRole(wid, mid, role, options) { return request(`${ws(wid)}/members/${path(mid)}/role`, 'PATCH', { role }, options) },
    async removeMember(wid, mid, options) { await request<void>(`${ws(wid)}/members/${path(mid)}`, 'DELETE', undefined, options) },
    async transferOwnership(wid, mid, options) { return request(`${ws(wid)}/ownership-transfer`, 'POST', { memberId: mid }, options) },
    async listInvitations(wid, options) { return request(`${ws(wid)}/invitations`, 'GET', undefined, options) },
    async listInvitationsPage(wid, query, options) { return request(`${ws(wid)}/invitations/page${queryString(query)}`, 'GET', undefined, options) },
    async listAuditEventsPage(wid, query, options) { return request(`${ws(wid)}/audit-events${queryString(query)}`, 'GET', undefined, options) },
    async inviteMember(wid, input, options) { return request(`${ws(wid)}/invitations`, 'POST', input, options) },
    async revokeInvitation(wid, iid, options) { await request<void>(`${ws(wid)}/invitations/${path(iid)}`, 'DELETE', undefined, options) },
    async inspectInvitation(token, options) { return request('/invitations/inspect', 'POST', { token }, options) },
    async acceptInvitation(token, options) { return request('/invitations/accept', 'POST', { token }, options) },
    async uploadFiles(wid, parentId, files, onProgress, options) {
      const nodes: DriveNode[] = []
      const total = files.reduce((sum, file) => sum + file.size, 0)
      let loaded = 0
      for (const file of files) {
        options?.signal?.throwIfAborted()
        onProgress?.({ loaded, total, percent: total ? Math.round(loaded / total * 100) : 0, filename: file.name })
        const upload = await request<{ uploadId: string; uploadUrl: string; headers?: Record<string, string> }>(`${ws(wid)}/files/uploads`, 'POST', { name: file.name, parentId, size: file.size, mimeType: file.type || 'application/octet-stream' }, options)
        let uploadUrl: URL
        try { uploadUrl = new URL(upload.uploadUrl) } catch { throw new ApiError(502, 'INVALID_UPLOAD_URL', 'Geçersiz yükleme adresi alındı.') }
        if (!['http:', 'https:'].includes(uploadUrl.protocol)) throw new ApiError(502, 'INVALID_UPLOAD_URL', 'Geçersiz yükleme adresi alındı.')
        // The signed bucket request must never receive API session cookies or the CSRF token.
        const response = await safeFetch(uploadUrl.toString(), { method: 'PUT', body: file, headers: upload.headers, credentials: 'omit', signal: options?.signal, redirect: 'error', referrerPolicy: 'no-referrer' })
        if (!response.ok) throw new ApiError(response.status, 'UPLOAD_FAILED', `${file.name} yüklenemedi. Tekrar dene.`)
        nodes.push(await request<DriveNode>(`${ws(wid)}/files/uploads/${path(upload.uploadId)}/complete`, 'POST', undefined, options))
        loaded += file.size
        // Fetch does not expose upload-byte progress; report completed files accurately.
        onProgress?.({ loaded, total, percent: total ? Math.round(loaded / total * 100) : 100, filename: file.name })
      }
      return nodes
    },
    async getContent(wid, nid, options) { return content(`${ws(wid)}/files/${path(nid)}/content`, 'dosya', options) },
    async downloadFolder(wid, nid, options: ArchiveOptions = {}) {
      const controller = new AbortController()
      const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 10 * 60_000, 30 * 60_000))
      const intervalMs = Math.max(1, Math.min(options.pollIntervalMs ?? 1500, 10_000))
      let timedOut = false, job: ArchiveJob | undefined
      const cancel = () => controller.abort(options.signal?.reason)
      options.signal?.throwIfAborted()
      options.signal?.addEventListener('abort', cancel, { once: true })
      const timeout = setTimeout(() => { timedOut = true; controller.abort(new DOMException('Arşiv hazırlama süresi aşıldı.', 'TimeoutError')) }, timeoutMs)
      const jobOptions = { signal: controller.signal }
      try {
        job = await request<ArchiveJob>(`${ws(wid)}/archives`, 'POST', { nodeId: nid }, jobOptions)
        for (;;) {
          controller.signal.throwIfAborted()
          options.onProgress?.(job)
          if (job.status === 'ready') {
            clearTimeout(timeout)
            return await content(`${ws(wid)}/archives/${path(job.id)}/content`, job.filename || 'klasor.zip', jobOptions)
          }
          if (['failed', 'cancelled', 'expired'].includes(job.status)) throw new ApiError(409, job.errorCode || 'ARCHIVE_UNAVAILABLE', job.status === 'cancelled' ? 'Arşiv hazırlama iptal edildi.' : job.status === 'expired' ? 'Arşivin süresi doldu. Yeniden hazırlayabilirsin.' : 'Arşiv hazırlanamadı. Yeniden dene.')
          await new Promise<void>((resolve, reject) => {
            const signal = controller.signal
            const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
            const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, intervalMs)
            signal.addEventListener('abort', abort, { once: true })
            if (signal.aborted) abort()
          })
          job = await request<ArchiveJob>(`${ws(wid)}/archives/${path(job.id)}`, 'GET', undefined, jobOptions)
        }
      } catch (cause) {
        if (timedOut) throw new ApiError(408, 'ARCHIVE_TIMEOUT', 'Arşiv hazırlama süresi aşıldı. Yeniden deneyebilirsin.')
        throw cause
      } finally {
        clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel)
        // Release the slot after success, cancellation or transfer failure, including ready jobs.
        // Cleanup must survive the caller's abort without replacing the original result/error.
        if (job && ['pending', 'running', 'ready'].includes(job.status)) {
          try { await raw(`${ws(wid)}/archives/${path(job.id)}`, 'DELETE', undefined, { signal: AbortSignal.timeout(5000) }) } catch { /* Server TTL remains the cleanup fallback. */ }
        }
      }
    },
  }
}
