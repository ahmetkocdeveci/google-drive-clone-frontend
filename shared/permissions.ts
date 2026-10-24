import type { Permission, Role } from './types.ts'

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: [
    'workspace:read',
    'workspace:update',
    'workspace:delete',
    'content:read',
    'content:create',
    'content:update',
    'content:delete',
    'members:read',
    'members:invite',
    'members:update-role',
    'members:remove',
    'invitations:read',
    'invitations:revoke',
    'audit:read',
  ],
  editor: ['workspace:read', 'content:read', 'content:create', 'content:update', 'content:delete'],
  viewer: ['workspace:read', 'content:read'],
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function capabilitiesFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]]
}
