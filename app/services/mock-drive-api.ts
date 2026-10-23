import type { DriveApi } from './drive-api.ts'
import { ApiError } from './api-error.ts'
import { capabilitiesFor, hasPermission } from '../../shared/permissions.ts'
import type { ApiOptions, AuditEvent, DriveNode, Invitation, Member, NodeType, Page, PageQuery, Permission, Role, User, Workspace } from '../../shared/types.ts'
import { createZip } from './zip.ts'

type WorkspaceRecord = Pick<Workspace, 'id' | 'name' | 'description' | 'color' | 'createdAt' | 'storageLimit'>
type MemberRecord = { id: string; workspaceId: string; userId: string; role: Role; joinedAt: string }
type InvitationRecord = Omit<Invitation, 'demoToken'> & { token: string; acceptedBy?: string }

function copy<T>(value: T): T { return structuredClone(value) }
function now(): string { return new Date().toISOString() }
function checkAbort(options?: ApiOptions): void { options?.signal?.throwIfAborted() }
function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'INVALID_EMAIL', 'Geçerli bir e-posta adresi gir.')
  return email
}
function validName(value: string): string {
  const name = value.trim()
  if (!name || name.length > 150 || /[\x00-\x1f/\\]/.test(name) || name === '.' || name === '..') throw new ApiError(400, 'INVALID_NAME', 'Ad 1–150 karakter olmalı; / ve \\ içermemeli.')
  return name
}
export function getNodeType(node: Pick<DriveNode, 'kind' | 'mimeType' | 'name'>): NodeType {
  if (node.kind === 'folder') return 'folder'
  if (node.mimeType.startsWith('image/')) return 'image'
  if (node.mimeType.startsWith('video/')) return 'video'
  if (node.mimeType.startsWith('audio/')) return 'audio'
  if (node.mimeType === 'application/pdf') return 'pdf'
  if (/spreadsheet|excel|csv/.test(node.mimeType)) return 'spreadsheet'
  if (/presentation|powerpoint/.test(node.mimeType)) return 'presentation'
  if (/text|document|word/.test(node.mimeType)) return 'document'
  return 'other'
}

/** A browser-memory simulation. It is deliberately not an authentication or security boundary. */
export function createMockDriveApi(): DriveApi {
  const users = new Map<string, User>([
    ['user-ahmet', { id: 'user-ahmet', name: 'Ahmet Koçdeveci', email: 'ahmet@example.com', emailVerified: true }],
    ['user-elif', { id: 'user-elif', name: 'Elif Yılmaz', email: 'elif@example.com', emailVerified: true }],
    ['user-deniz', { id: 'user-deniz', name: 'Deniz Kaya', email: 'deniz@example.com', emailVerified: true }],
    ['user-zeynep', { id: 'user-zeynep', name: 'Zeynep Aydın', email: 'zeynep@example.com', emailVerified: true }],
  ])
  const passwords = new Map([...users.keys()].map(id => [id, 'Demo1234!']))
  const resetTokens = new Map<string, string>()
  const cursors = new Map<string, { scope: string; fingerprint: string; offset: number; limit: number }>()
  let currentUserId: string | null = 'user-ahmet'
  let sequence = 1
  const id = (prefix: string) => `${prefix}-${sequence++}`
  const createdAt = now()
  const workspaces = new Map<string, WorkspaceRecord>([
    ['ws-design', { id: 'ws-design', name: 'Tasarım Ekibi', description: 'Birlikte düşündüğümüz, ürettiğimiz ve paylaştığımız alan.', color: '#4285f4', createdAt, storageLimit: 15 * 1024 ** 3 }],
    ['ws-product', { id: 'ws-product', name: 'Ürün Ekibi', description: 'Ürün planları ve ekip dokümanları.', color: '#8b5cf6', createdAt, storageLimit: 15 * 1024 ** 3 }],
    ['ws-archive', { id: 'ws-archive', name: 'Ortak Arşiv', description: 'Referanslar ve tamamlanan çalışmalar.', color: '#16a085', createdAt, storageLimit: 15 * 1024 ** 3 }],
    ['ws-partner', { id: 'ws-partner', name: 'Yeni Proje', description: 'Davet ile katılacağın ortak çalışma alanı.', color: '#e99c23', createdAt, storageLimit: 15 * 1024 ** 3 }],
  ])
  const memberships = new Map<string, MemberRecord>()
  for (const [wid, uid, role] of [
    ['ws-design', 'user-ahmet', 'owner'], ['ws-design', 'user-elif', 'editor'], ['ws-design', 'user-deniz', 'viewer'],
    ['ws-product', 'user-ahmet', 'editor'], ['ws-product', 'user-elif', 'owner'], ['ws-product', 'user-zeynep', 'editor'],
    ['ws-archive', 'user-ahmet', 'viewer'], ['ws-archive', 'user-deniz', 'owner'], ['ws-partner', 'user-elif', 'owner'],
  ] as [string, string, Role][]) {
    const mid = `member-${wid}-${uid}`
    memberships.set(mid, { id: mid, workspaceId: wid, userId: uid, role, joinedAt: createdAt })
  }
  const nodes = new Map<string, DriveNode>()
  const contents = new Map<string, Blob>()
  const invitations = new Map<string, InvitationRecord>()
  const auditEvents: AuditEvent[] = []
  function record(wid: string, action: string, targetId: string) {
    const user = authenticated()
    auditEvents.push({ id: id('event'), workspaceId: wid, action, targetId, actor: { id: user.id, name: user.name }, createdAt: now() })
  }
  invitations.set('invitation-demo', {
    id: 'invitation-demo', workspaceId: 'ws-partner', email: 'ahmet@example.com', role: 'editor', status: 'pending',
    expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(), createdAt, invitedBy: { id: 'user-elif', name: 'Elif Yılmaz' }, token: 'demo-invitation',
  })
  function addNode(wid: string, nodeId: string, name: string, parentId: string | null, blob?: Blob): void {
    nodes.set(nodeId, { id: nodeId, workspaceId: wid, parentId, name, kind: blob ? 'file' : 'folder', mimeType: blob?.type || '', size: blob?.size || 0, createdAt, updatedAt: createdAt, createdBy: { id: 'user-ahmet', name: 'Ahmet Koçdeveci' }, version: 1 })
    if (blob) contents.set(nodeId, blob)
  }
  addNode('ws-design', 'folder-design', 'Tasarım Dosyaları', null)
  addNode('ws-design', 'folder-documents', 'Proje Dokümanları', null)
  addNode('ws-design', 'folder-brand', 'Marka Kimliği', null)
  addNode('ws-design', 'folder-references', 'İlham Panosu', 'folder-design')
  addNode('ws-design', 'file-brief', 'Proje özeti.txt', null, new Blob(['ORTAK • PROJE ÖZETİ\n\nHedef: Workspace tabanlı güvenli dosya paylaşımı.\n\nOwner: Alanı ve üyeleri yönetir.\nEditor: İçerik oluşturur ve düzenler.\nViewer: İçeriği görüntüler ve indirir.\n\nBu dosya frontend demosuna ait örnek bir içeriktir.'], { type: 'text/plain;charset=utf-8' }))
  addNode('ws-design', 'file-plan', 'Proje takvimi.csv', null, new Blob(['Aşama,Sorumlu,Durum\nMimari,Ahmet,Tamamlandı\nFrontend,Ahmet,Devam ediyor\nBackend,Ekip,Planlandı\n'], { type: 'text/csv;charset=utf-8' }))
  addNode('ws-design', 'file-notes', 'Toplantı notları.txt', 'folder-documents', new Blob(['TOPLANTI NOTLARI\n\n• Her kullanıcı birden fazla workspace kullanabilir.\n• Roller workspace bazında belirlenir.\n• Dosyalar özel bucket üzerinde tutulacak.\n\nBir sonraki adım: backend API entegrasyonu.'], { type: 'text/plain;charset=utf-8' }))
  addNode('ws-design', 'file-cover', 'Kapak görseli.svg', null, new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720"><rect width="1200" height="720" fill="#eaf1fb"/><circle cx="970" cy="120" r="290" fill="#d3e3fd"/><circle cx="140" cy="690" r="280" fill="#c4eed0"/><rect x="110" y="140" width="88" height="72" rx="18" fill="#0b57d0"/><text x="110" y="350" font-family="sans-serif" font-weight="700" font-size="88" fill="#1f1f1f">Birlikte üretelim.</text><text x="115" y="420" font-family="sans-serif" font-size="30" fill="#53657c">Tüm dosyaların. Tüm ekibin. Tek bir yerde.</text><text x="115" y="610" font-family="sans-serif" font-size="22" fill="#0b57d0">ORTAK / TASARIM EKİBİ</text></svg>'], { type: 'image/svg+xml' }))
  addNode('ws-design', 'file-colors', 'Renk paleti.txt', 'folder-brand', new Blob(['Ana mavi: #0b57d0\nZemin: #f8fafd\nYüzey: #ffffff\nMetin: #1f1f1f\n'], { type: 'text/plain;charset=utf-8' }))
  addNode('ws-product', 'folder-roadmap', 'Yol Haritası', null)
  addNode('ws-product', 'file-roadmap', 'Ürün planı.txt', null, new Blob(['ÜRÜN PLANI\n\n1. Kimlik ve oturum\n2. Workspace üyeliği\n3. Davetler\n4. Dosyalar ve klasörler\n'], { type: 'text/plain;charset=utf-8' }))
  addNode('ws-archive', 'folder-archive', 'Tamamlanan Projeler', null)
  addNode('ws-archive', 'file-archive', 'Arşiv rehberi.txt', null, new Blob(['ORTAK ARŞİV\n\nBu workspace içinde Viewer rolündesin. Dosyaları okuyabilir ve indirebilirsin. Değişiklik yapamazsın.'], { type: 'text/plain;charset=utf-8' }))

  function authenticated(verified = true): User {
    const user = currentUserId ? users.get(currentUserId) : undefined
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Devam etmek için giriş yap.')
    if (verified && !user.emailVerified) throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Önce e-posta adresini doğrula.')
    return user
  }
  function context(wid: string, permission: Permission, options?: ApiOptions) {
    checkAbort(options)
    const user = authenticated()
    const workspace = workspaces.get(wid)
    const membership = [...memberships.values()].find(member => member.workspaceId === wid && member.userId === user.id)
    if (!workspace || !membership) throw new ApiError(404, 'WORKSPACE_NOT_FOUND', 'Workspace bulunamadı.')
    if (!hasPermission(membership.role, permission)) throw new ApiError(403, 'FORBIDDEN', 'Bu işlem için yetkin bulunmuyor.')
    return { user, workspace, membership }
  }
  function workspaceDto(wid: string): Workspace {
    const { workspace, membership } = context(wid, 'workspace:read')
    return copy({ ...workspace, role: membership.role, capabilities: capabilitiesFor(membership.role), memberCount: [...memberships.values()].filter(m => m.workspaceId === wid).length, ownerCount: [...memberships.values()].filter(m => m.workspaceId === wid && m.role === 'owner').length, storageUsed: [...nodes.values()].filter(n => n.workspaceId === wid).reduce((total, n) => total + n.size, 0) })
  }
  function scopedNode(wid: string, nid: string): DriveNode {
    const node = nodes.get(nid)
    if (!node || node.workspaceId !== wid) throw new ApiError(404, 'NODE_NOT_FOUND', 'Dosya veya klasör bulunamadı.')
    return node
  }
  function parentFolder(wid: string, parentId: string | null): void {
    if (parentId !== null && scopedNode(wid, parentId).kind !== 'folder') throw new ApiError(400, 'INVALID_PARENT', 'Hedef bir klasör olmalı.')
  }
  function scopedMember(wid: string, mid: string): MemberRecord {
    const member = memberships.get(mid)
    if (!member || member.workspaceId !== wid) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Üye bulunamadı.')
    return member
  }
  function memberDto(member: MemberRecord): Member {
    const user = users.get(member.userId)!
    return copy({ ...member, name: user.name, email: user.email, isCurrentUser: member.userId === currentUserId })
  }
  function preserveOwner(wid: string, member: MemberRecord, nextRole?: Role): void {
    if (member.role === 'owner' && nextRole !== 'owner' && [...memberships.values()].filter(m => m.workspaceId === wid && m.role === 'owner').length < 2) throw new ApiError(409, 'LAST_OWNER', 'Workspace içinde en az bir Owner bulunmalı. Önce sahipliği devret.')
  }
  function invitationDto(invitation: InvitationRecord): Invitation {
    const { token: _token, acceptedBy: _acceptedBy, ...dto } = invitation
    const status = dto.status === 'pending' && new Date(dto.expiresAt).getTime() <= Date.now() ? 'expired' : dto.status
    return copy({ ...dto, status })
  }
  function matchedInvitation(token: string, allowAccepted = false) {
    const user = authenticated()
    const invitation = [...invitations.values()].find(invite => invite.token === token)
    if (!invitation || invitation.email !== user.email || !workspaces.has(invitation.workspaceId)) throw new ApiError(404, 'INVITATION_UNAVAILABLE', 'Davet bulunamadı veya bu hesaba ait değil.')
    const currentMembership = [...memberships.values()].find(m => m.workspaceId === invitation.workspaceId && m.userId === user.id)
    if (allowAccepted && invitation.status === 'accepted' && invitation.acceptedBy === user.id && currentMembership) return { invitation, user, currentMembership }
    if (invitation.status !== 'pending' || new Date(invitation.expiresAt).getTime() <= Date.now()) throw new ApiError(404, 'INVITATION_UNAVAILABLE', 'Bu davetin süresi dolmuş veya davet kullanılmış.')
    return { invitation, user, currentMembership }
  }

  function paginate<T>(rows: T[], query: PageQuery = {}, scope: string): Page<T> {
    const limit = query.limit ?? 100
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, 'INVALID_PAGE', 'Sayfa boyutu 1–100 arasında olmalı.')
    const fingerprint = JSON.stringify(rows), boundScope = `${currentUserId}:${scope}`
    let offset = 0
    if (query.cursor) {
      const cursor = cursors.get(query.cursor)
      if (!cursor) throw new ApiError(400, 'INVALID_CURSOR', 'Sayfa bağlantısı geçersiz.')
      if (cursor.scope !== boundScope || cursor.fingerprint !== fingerprint || cursor.limit !== limit) throw new ApiError(409, 'CURSOR_STALE', 'Liste değişti. İlk sayfadan yenile.')
      offset = cursor.offset
    }
    const items = rows.slice(offset, offset + limit)
    let nextCursor: string | null = null
    if (offset + limit < rows.length) {
      nextCursor = crypto.randomUUID()
      cursors.set(nextCursor, { scope: boundScope, fingerprint, offset: offset + limit, limit })
      if (cursors.size > 2000) cursors.delete(cursors.keys().next().value!)
    }
    return { items: copy(items), nextCursor }
  }

  const api: DriveApi = {
    async getAuthProviders(options) { checkAbort(options); return { google: false } },
    async startGoogleSignIn(_input, options) { checkAbort(options); throw new ApiError(503, 'GOOGLE_NOT_CONFIGURED', 'Google ile giriş demo modunda kullanılamıyor.') },
    async getAuthIdentities(options) { checkAbort(options); const user = authenticated(); return { google: false, hasPassword: passwords.has(user.id) } },
    async startGoogleLink(_input, options) { checkAbort(options); authenticated(); throw new ApiError(503, 'GOOGLE_NOT_CONFIGURED', 'Google bağlantısı demo modunda kullanılamıyor.') },
    async requestPasswordReset(input, options) {
      checkAbort(options); const email = normalizedEmail(input.email)
      const user = [...users.values()].find(user => user.email === email)
      resetTokens.delete('demo-password-reset')
      if (user) resetTokens.set('demo-password-reset', user.id)
    },
    async confirmPasswordReset(input, options) {
      checkAbort(options); const userId = resetTokens.get(input.token)
      if (!userId) throw new ApiError(404, 'RESET_UNAVAILABLE', 'Şifre yenileme bağlantısı geçersiz veya süresi dolmuş.')
      if (input.password.length < 8 || input.password.length > 128) throw new ApiError(400, 'WEAK_PASSWORD', 'Şifre 8–128 karakter arasında olmalı.')
      passwords.set(userId, input.password)
      users.get(userId)!.emailVerified = true
      resetTokens.delete(input.token); currentUserId = null
    },
    async listWorkspacesPage(query, options) { return paginate(await api.listWorkspaces(options), query, 'workspaces') },
    async listNodesPage(wid, query = {}, options) { const { cursor, limit, ...filter } = query; return paginate(await api.listNodes(wid, filter, options), { cursor, limit }, `nodes:${wid}:${JSON.stringify(filter)}`) },
    async listMembersPage(wid, query, options) { return paginate(await api.listMembers(wid, options), query, `members:${wid}`) },
    async listInvitationsPage(wid, query, options) { return paginate(await api.listInvitations(wid, options), query, `invitations:${wid}`) },
    async listAuditEventsPage(wid, query, options) {
      context(wid, 'audit:read', options)
      const rows = auditEvents.filter(event => event.workspaceId === wid).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
      return paginate(rows, { ...query, limit: query?.limit ?? 50 }, `audit:${wid}`)
    },
    async getSession(options) { checkAbort(options); return currentUserId ? { user: copy(authenticated(false)) } : null },
    async login(input, options) {
      checkAbort(options)
      const email = normalizedEmail(input.email)
      const user = [...users.values()].find(u => u.email === email)
      if (!user || passwords.get(user.id) !== input.password) throw new ApiError(401, 'INVALID_CREDENTIALS', 'E-posta veya parola hatalı.')
      currentUserId = user.id
      return { user: copy(user) }
    },
    async register(input, options) {
      checkAbort(options)
      const email = normalizedEmail(input.email)
      if ([...users.values()].some(u => u.email === email)) throw new ApiError(409, 'EMAIL_EXISTS', 'Bu e-posta adresiyle kayıtlı bir hesap var.')
      if (input.password.length < 8) throw new ApiError(400, 'WEAK_PASSWORD', 'Parola en az 8 karakter olmalı.')
      const user: User = { id: id('user'), name: validName(input.name), email, emailVerified: false }
      users.set(user.id, user); passwords.set(user.id, input.password); currentUserId = user.id
      return { user: copy(user) }
    },
    async logout(options) { checkAbort(options); currentUserId = null },
    async resendVerification(options) { checkAbort(options); authenticated(false) },
    async verifyEmail(input, options) {
      checkAbort(options)
      const user = authenticated(false)
      if (input.token !== 'demo-email-verification') throw new ApiError(400, 'INVALID_TOKEN', 'Doğrulama bağlantısı geçersiz.')
      user.emailVerified = true
      return { user: copy(user) }
    },
    async listWorkspaces(options) {
      checkAbort(options)
      const user = authenticated()
      return [...memberships.values()].filter(m => m.userId === user.id && workspaces.has(m.workspaceId)).map(m => workspaceDto(m.workspaceId))
    },
    async createWorkspace(input, options) {
      checkAbort(options)
      const user = authenticated()
      const workspaceId = id('workspace')
      workspaces.set(workspaceId, { id: workspaceId, name: validName(input.name), description: (input.description || '').slice(0, 500), color: input.color || '#4285f4', createdAt: now(), storageLimit: 15 * 1024 ** 3 })
      const memberId = id('member')
      memberships.set(memberId, { id: memberId, workspaceId, userId: user.id, role: 'owner', joinedAt: now() })
      record(workspaceId, 'workspace.created', workspaceId)
      return workspaceDto(workspaceId)
    },
    async getWorkspace(wid, options) { context(wid, 'workspace:read', options); return workspaceDto(wid) },
    async updateWorkspace(wid, input, options) {
      const { workspace } = context(wid, 'workspace:update', options)
      if (input.name !== undefined) workspace.name = validName(input.name)
      if (input.description !== undefined) workspace.description = input.description.slice(0, 500)
      if (input.color !== undefined) workspace.color = input.color
      if (Object.keys(input).length) record(wid, 'workspace.updated', wid)
      return workspaceDto(wid)
    },
    async deleteWorkspace(wid, options) {
      context(wid, 'workspace:delete', options)
      record(wid, 'workspace.deleted', wid)
      workspaces.delete(wid)
      for (const [nid, node] of nodes) if (node.workspaceId === wid) { nodes.delete(nid); contents.delete(nid) }
      for (const [mid, member] of memberships) if (member.workspaceId === wid) memberships.delete(mid)
      for (const [iid, invitation] of invitations) if (invitation.workspaceId === wid) invitations.delete(iid)
    },
    async listNodes(wid, query = {}, options) {
      context(wid, 'content:read', options)
      if (query.parentId) parentFolder(wid, query.parentId)
      let result = [...nodes.values()].filter(n => n.workspaceId === wid)
      if (!query.search && !query.recent) result = result.filter(n => n.parentId === (query.parentId ?? null))
      if (query.search) result = result.filter(n => n.name.toLocaleLowerCase('tr').includes(query.search!.trim().toLocaleLowerCase('tr')))
      if (query.type && query.type !== 'all') result = result.filter(n => getNodeType(n) === query.type)
      const direction = query.direction === 'desc' ? -1 : 1
      result.sort((a, b) => {
        if (!query.recent && a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
        const comparison = query.sort === 'size' ? a.size - b.size : query.sort === 'updatedAt' || query.recent ? a.updatedAt.localeCompare(b.updatedAt) : a.name.localeCompare(b.name, 'tr')
        return (comparison || a.id.localeCompare(b.id)) * (query.recent ? -1 : direction)
      })
      return copy(result)
    },
    async getNode(wid, nid, options) { context(wid, 'content:read', options); return copy(scopedNode(wid, nid)) },
    async createFolder(wid, input, options) {
      const { user } = context(wid, 'content:create', options)
      parentFolder(wid, input.parentId)
      const folder: DriveNode = { id: id('folder'), workspaceId: wid, parentId: input.parentId, name: validName(input.name), kind: 'folder', mimeType: '', size: 0, createdAt: now(), updatedAt: now(), createdBy: { id: user.id, name: user.name }, version: 1 }
      nodes.set(folder.id, folder)
      record(wid, 'folder.created', folder.id)
      return copy(folder)
    },
    async updateNode(wid, nid, input, options) {
      context(wid, 'content:update', options)
      const node = scopedNode(wid, nid)
      if (input.version !== undefined && input.version !== node.version) throw new ApiError(409, 'VERSION_CONFLICT', 'Dosya değişmiş. Listeyi yenileyip tekrar dene.')
      const name = input.name !== undefined ? validName(input.name) : node.name
      if (input.parentId !== undefined) {
        parentFolder(wid, input.parentId)
        let ancestorId = input.parentId
        while (ancestorId !== null) {
          if (ancestorId === nid) throw new ApiError(409, 'FOLDER_CYCLE', 'Bir klasörü kendisinin veya alt klasörünün içine taşıyamazsın.')
          ancestorId = scopedNode(wid, ancestorId).parentId
        }
        node.parentId = input.parentId
      }
      node.name = name; node.updatedAt = now(); node.version++
      record(wid, 'node.updated', node.id)
      return copy(node)
    },
    async deleteNodes(wid, nodeIds, options) {
      context(wid, 'content:delete', options)
      for (const nid of nodeIds) scopedNode(wid, nid)
      const remove = new Set(nodeIds)
      let changed = true
      while (changed) {
        changed = false
        for (const node of nodes.values()) if (node.workspaceId === wid && node.parentId && remove.has(node.parentId) && !remove.has(node.id)) { remove.add(node.id); changed = true }
      }
      for (const nid of remove) { nodes.delete(nid); contents.delete(nid) }
      for (const nid of new Set(nodeIds)) record(wid, 'node.delete-requested', nid)
    },
    async listMembers(wid, options) { context(wid, 'members:read', options); return [...memberships.values()].filter(m => m.workspaceId === wid).map(memberDto) },
    async changeMemberRole(wid, mid, role, options) {
      context(wid, 'members:update-role', options)
      if (!['owner', 'editor', 'viewer'].includes(role)) throw new ApiError(400, 'INVALID_ROLE', 'Geçersiz rol.')
      const member = scopedMember(wid, mid)
      preserveOwner(wid, member, role)
      if (member.role !== role) { member.role = role; record(wid, 'member.role-changed', mid) }
      return memberDto(member)
    },
    async removeMember(wid, mid, options) {
      context(wid, 'members:remove', options)
      const member = scopedMember(wid, mid)
      preserveOwner(wid, member)
      record(wid, 'member.removed', mid)
      memberships.delete(mid)
    },
    async transferOwnership(wid, mid, options) {
      const { membership } = context(wid, 'members:update-role', options)
      const target = scopedMember(wid, mid)
      if (target.id !== membership.id) { record(wid, 'workspace.ownership-transferred', target.id); target.role = 'owner'; membership.role = 'editor' }
      return workspaceDto(wid)
    },
    async listInvitations(wid, options) { context(wid, 'invitations:read', options); return [...invitations.values()].filter(i => i.workspaceId === wid).map(invitationDto) },
    async inviteMember(wid, input, options) {
      const { user } = context(wid, 'members:invite', options)
      if (!['editor', 'viewer'].includes(input.role)) throw new ApiError(400, 'INVALID_INVITE_ROLE', 'Davette yalnızca Editor veya Viewer seçilebilir.')
      const email = normalizedEmail(input.email)
      if ([...memberships.values()].some(m => m.workspaceId === wid && users.get(m.userId)?.email === email)) throw new ApiError(409, 'ALREADY_MEMBER', 'Bu kişi zaten workspace üyesi.')
      for (const invitation of invitations.values()) if (invitation.workspaceId === wid && invitation.email === email && invitation.status === 'pending') invitation.status = 'revoked'
      const iid = id('invitation')
      const invitation: InvitationRecord = { id: iid, workspaceId: wid, email, role: input.role, status: 'pending', expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(), createdAt: now(), invitedBy: { id: user.id, name: user.name }, token: `demo-${iid}` }
      invitations.set(iid, invitation)
      record(wid, 'invitation.created', iid)
      return { ...invitationDto(invitation), demoToken: invitation.token }
    },
    async revokeInvitation(wid, iid, options) {
      context(wid, 'invitations:revoke', options)
      const invitation = invitations.get(iid)
      if (!invitation || invitation.workspaceId !== wid) throw new ApiError(404, 'INVITATION_UNAVAILABLE', 'Davet bulunamadı.')
      if (invitation.status !== 'pending') throw new ApiError(409, 'INVITATION_NOT_PENDING', 'Yalnızca bekleyen davet iptal edilebilir.')
      invitation.status = 'revoked'
      record(wid, 'invitation.revoked', iid)
    },
    async inspectInvitation(token, options) {
      checkAbort(options)
      const { invitation } = matchedInvitation(token)
      return copy({ id: invitation.id, workspaceId: invitation.workspaceId, workspaceName: workspaces.get(invitation.workspaceId)!.name, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt })
    },
    async acceptInvitation(token, options) {
      checkAbort(options)
      const { invitation, user, currentMembership } = matchedInvitation(token, true)
      if (!currentMembership) {
        const mid = id('member')
        memberships.set(mid, { id: mid, workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role, joinedAt: now() })
      }
      if (invitation.status !== 'accepted') record(invitation.workspaceId, 'invitation.accepted', invitation.id)
      invitation.status = 'accepted'; invitation.acceptedBy = user.id
      return workspaceDto(invitation.workspaceId)
    },
    async uploadFiles(wid, parentId, files, onProgress, options) {
      const { user } = context(wid, 'content:create', options)
      parentFolder(wid, parentId)
      if (!files.length) return []
      const total = files.reduce((sum, file) => sum + file.size, 0)
      for (const file of files) {
        validName(file.name)
        if (file.size > 25 * 1024 ** 2) throw new ApiError(413, 'DEMO_FILE_TOO_LARGE', 'Demo modunda dosya başına sınır 25 MB.')
      }
      const result: DriveNode[] = []
      let loaded = 0
      for (const file of files) {
        context(wid, 'content:create', options)
        const node: DriveNode = { id: id('file'), workspaceId: wid, parentId, name: file.name, kind: 'file', mimeType: file.type || 'application/octet-stream', size: file.size, createdAt: now(), updatedAt: now(), createdBy: { id: user.id, name: user.name }, version: 1 }
        nodes.set(node.id, node); contents.set(node.id, file); result.push(copy(node)); loaded += file.size
        record(wid, 'file.upload-completed', node.id)
        onProgress?.({ loaded, total, percent: total ? Math.round(loaded / total * 100) : 100, filename: file.name })
      }
      return result
    },
    async getContent(wid, nid, options) {
      context(wid, 'content:read', options)
      const node = scopedNode(wid, nid)
      const blob = contents.get(nid)
      if (node.kind !== 'file' || !blob) throw new ApiError(400, 'NOT_A_FILE', 'Bu kaynak bir dosya değil.')
      return { blob, filename: node.name, mimeType: blob.type || node.mimeType }
    },
    async downloadFolder(wid, nid, options) {
      context(wid, 'content:read', options)
      const folder = scopedNode(wid, nid)
      if (folder.kind !== 'folder') throw new ApiError(400, 'NOT_A_FOLDER', 'Bu kaynak bir klasör değil.')
      const job = { id: id('archive'), workspaceId: wid, nodeId: nid, status: 'running' as const, filename: `${folder.name}.zip`, processedFiles: 0, bytes: 0, createdAt: now() }
      options?.onProgress?.(job)
      const entries: { path: string; blob: Blob }[] = []
      function collect(parentId: string, path: string): void {
        entries.push({ path: `${path}/`, blob: new Blob() })
        for (const child of nodes.values()) if (child.workspaceId === wid && child.parentId === parentId) {
          if (child.kind === 'folder') collect(child.id, `${path}/${child.name}`)
          else entries.push({ path: `${path}/${child.name}`, blob: contents.get(child.id)! })
        }
      }
      collect(nid, folder.name)
      const blob = await createZip(entries)
      context(wid, 'content:read', options)
      options?.onProgress?.({ ...job, status: 'ready', processedFiles: entries.filter(entry => !entry.path.endsWith('/')).length, bytes: blob.size })
      return { blob, filename: `${folder.name}.zip`, mimeType: 'application/zip' }
    },
  }
  return api
}
