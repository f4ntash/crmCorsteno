export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type Permission = 'organization.read' | 'organization.manage' | 'project.read' | 'project.manage' | 'analytics.read' | 'crm.read' | 'crm.manage';
const rank: Record<Role, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };
const minimum: Record<Permission, Role> = { 'organization.read': 'viewer', 'project.read': 'viewer', 'analytics.read': 'member', 'crm.read': 'member', 'organization.manage': 'admin', 'project.manage': 'admin', 'crm.manage': 'admin' };
export function hasRole(role: Role, required: Role) { return rank[role] >= rank[required]; }
export function hasPermission(role: Role, permission: Permission) { return hasRole(role, minimum[permission]); }
