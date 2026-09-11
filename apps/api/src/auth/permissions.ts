export type Role = 'owner' | 'admin' | 'member' | 'viewer' | 'operator';
export type Permission = 'organization.read' | 'organization.manage' | 'project.read' | 'project.manage' | 'analytics.read' | 'crm.read' | 'crm.manage' | 'activity.read' | 'assets.read' | 'assets.manage' | 'claims.redeem';
export const CRM_PERMISSIONS: Permission[] = ['crm.read', 'crm.manage', 'activity.read', 'assets.read', 'assets.manage', 'claims.redeem'];
const rank: Record<Exclude<Role, 'operator'>, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };
const minimum: Record<Exclude<Permission, 'claims.redeem'>, Exclude<Role, 'operator'>> = { 'organization.read': 'viewer', 'project.read': 'viewer', 'analytics.read': 'member', 'crm.read': 'member', 'organization.manage': 'admin', 'project.manage': 'admin', 'crm.manage': 'admin', 'activity.read': 'member', 'assets.read': 'member', 'assets.manage': 'admin' };
export function hasRole(role: Role, required: Role) { return role !== 'operator' && required !== 'operator' && rank[role] >= rank[required]; }
export function hasPermission(role: Role, permission: Permission) { if (permission === 'claims.redeem') return role === 'operator' || role === 'admin' || role === 'owner'; if (role === 'operator') return false; return hasRole(role, minimum[permission]); }
