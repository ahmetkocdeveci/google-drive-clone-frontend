export type Role = 'owner' | 'editor' | 'viewer'
export type InviteRole = Exclude<Role, 'owner'>
export type Permission =
  | 'workspace:read'
  | 'workspace:update'
  | 'workspace:delete'
  | 'content:read'
  | 'content:create'
  | 'content:update'
  | 'content:delete'
  | 'members:read'
  | 'members:invite'
  | 'members:update-role'
  | 'members:remove'
  | 'invitations:read'
  | 'invitations:revoke'
  | 'audit:read'

export interface User {
  id: string
  name: string
  email: string
  emailVerified: boolean
}
export interface Session {
  user: User
}
export interface AuthProviders {
  google: boolean
}
export interface AuthIdentities {
  google: boolean
  hasPassword: boolean
}
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}
export interface PageQuery {
  limit?: number
  cursor?: string
}
export interface AuditEvent {
  id: string
  workspaceId: string
  action: string
  targetId?: string
  actor: { id: string; name: string }
  createdAt: string
}
export interface Workspace {
  id: string
  name: string
  description: string
  color: string
  role: Role
  capabilities: Permission[]
  memberCount: number
  ownerCount?: number
  storageUsed: number
  storageLimit: number
  createdAt: string
}
export interface DriveNode {
  id: string
  workspaceId: string
  parentId: string | null
  name: string
  kind: 'file' | 'folder'
  mimeType: string
  size: number
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
  version: number
}
export interface Member {
  id: string
  userId: string
  workspaceId: string
  name: string
  email: string
  role: Role
  joinedAt: string
  isCurrentUser: boolean
}
export interface Invitation {
  id: string
  workspaceId: string
  email: string
  role: InviteRole
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  expiresAt: string
  createdAt: string
  invitedBy: { id: string; name: string }
  /** Available only from the in-memory demo's invitation creation response. Never persisted. */
  demoToken?: string
}
export interface InvitationPreview {
  id: string
  workspaceId: string
  workspaceName: string
  email: string
  role: InviteRole
  expiresAt: string
}
export type NodeType =
  | 'all'
  | 'folder'
  | 'image'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'video'
  | 'audio'
  | 'other'
export interface NodeQuery {
  parentId?: string | null
  search?: string
  type?: NodeType
  sort?: 'name' | 'updatedAt' | 'size'
  direction?: 'asc' | 'desc'
  recent?: boolean
}
export interface ApiOptions {
  signal?: AbortSignal
}
export interface ArchiveJob {
  id: string
  workspaceId: string
  nodeId: string
  status: 'pending' | 'running' | 'ready' | 'failed' | 'cancelled' | 'expired'
  filename: string
  processedFiles: number
  totalFiles?: number
  bytes: number
  errorCode?: string
  expiresAt?: string
  createdAt: string
}
export interface ArchiveOptions extends ApiOptions {
  onProgress?: (job: ArchiveJob) => void
  pollIntervalMs?: number
  timeoutMs?: number
}
export interface ContentDownload {
  blob: Blob
  filename: string
  mimeType: string
}
export interface UploadProgress {
  loaded: number
  total: number
  percent: number
  filename: string
}
export interface LoginInput {
  email: string
  password: string
}
export interface RegisterInput extends LoginInput {
  name: string
}
export interface WorkspaceInput {
  name: string
  description?: string
  color?: string
}
export interface FolderInput {
  name: string
  parentId: string | null
}
export interface NodeUpdate {
  name?: string
  parentId?: string | null
  version?: number
}
