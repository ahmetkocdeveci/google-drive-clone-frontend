import type { ApiOptions, ArchiveOptions, AuditEvent, AuthIdentities, AuthProviders, ContentDownload, DriveNode, FolderInput, Invitation, InvitationPreview, InviteRole, LoginInput, Member, NodeQuery, NodeUpdate, Page, PageQuery, RegisterInput, Role, Session, UploadProgress, Workspace, WorkspaceInput } from '../../shared/types.ts'

export interface DriveApi {
  getAuthProviders(options?: ApiOptions): Promise<AuthProviders>
  getAuthIdentities(options?: ApiOptions): Promise<AuthIdentities>
  startGoogleLink(input: { password?: string }, options?: ApiOptions): Promise<{ authorizationUrl: string }>
  requestPasswordReset(input: { email: string }, options?: ApiOptions): Promise<void>
  confirmPasswordReset(input: { token: string; password: string }, options?: ApiOptions): Promise<void>
  getSession(options?: ApiOptions): Promise<Session | null>
  login(input: LoginInput, options?: ApiOptions): Promise<Session>
  register(input: RegisterInput, options?: ApiOptions): Promise<Session>
  logout(options?: ApiOptions): Promise<void>
  verifyEmail(input: { token: string }, options?: ApiOptions): Promise<Session>
  resendVerification(options?: ApiOptions): Promise<void>
  listWorkspaces(options?: ApiOptions): Promise<Workspace[]>
  listWorkspacesPage(query?: PageQuery, options?: ApiOptions): Promise<Page<Workspace>>
  createWorkspace(input: WorkspaceInput, options?: ApiOptions): Promise<Workspace>
  getWorkspace(workspaceId: string, options?: ApiOptions): Promise<Workspace>
  updateWorkspace(workspaceId: string, input: Partial<WorkspaceInput>, options?: ApiOptions): Promise<Workspace>
  deleteWorkspace(workspaceId: string, options?: ApiOptions): Promise<void>
  listNodes(workspaceId: string, query?: NodeQuery, options?: ApiOptions): Promise<DriveNode[]>
  listNodesPage(workspaceId: string, query?: NodeQuery & PageQuery, options?: ApiOptions): Promise<Page<DriveNode>>
  getNode(workspaceId: string, nodeId: string, options?: ApiOptions): Promise<DriveNode>
  createFolder(workspaceId: string, input: FolderInput, options?: ApiOptions): Promise<DriveNode>
  updateNode(workspaceId: string, nodeId: string, input: NodeUpdate, options?: ApiOptions): Promise<DriveNode>
  deleteNodes(workspaceId: string, nodeIds: string[], options?: ApiOptions): Promise<void>
  listMembers(workspaceId: string, options?: ApiOptions): Promise<Member[]>
  listMembersPage(workspaceId: string, query?: PageQuery, options?: ApiOptions): Promise<Page<Member>>
  changeMemberRole(workspaceId: string, memberId: string, role: Role, options?: ApiOptions): Promise<Member>
  removeMember(workspaceId: string, memberId: string, options?: ApiOptions): Promise<void>
  transferOwnership(workspaceId: string, memberId: string, options?: ApiOptions): Promise<Workspace>
  listInvitations(workspaceId: string, options?: ApiOptions): Promise<Invitation[]>
  listInvitationsPage(workspaceId: string, query?: PageQuery, options?: ApiOptions): Promise<Page<Invitation>>
  listAuditEventsPage(workspaceId: string, query?: PageQuery, options?: ApiOptions): Promise<Page<AuditEvent>>
  inviteMember(workspaceId: string, input: { email: string; role: InviteRole }, options?: ApiOptions): Promise<Invitation>
  revokeInvitation(workspaceId: string, invitationId: string, options?: ApiOptions): Promise<void>
  inspectInvitation(token: string, options?: ApiOptions): Promise<InvitationPreview>
  acceptInvitation(token: string, options?: ApiOptions): Promise<Workspace>
  uploadFiles(workspaceId: string, parentId: string | null, files: File[], onProgress?: (progress: UploadProgress) => void, options?: ApiOptions): Promise<DriveNode[]>
  getContent(workspaceId: string, nodeId: string, options?: ApiOptions): Promise<ContentDownload>
  downloadFolder(workspaceId: string, nodeId: string, options?: ArchiveOptions): Promise<ContentDownload>
}
