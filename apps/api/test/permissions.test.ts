import { describe, expect, it } from 'vitest';
import { CRM_PERMISSIONS, hasPermission, hasRole } from '../src/auth/permissions';

describe('organization role permissions', () => {
  it('gives operators only the narrow redemption permission', () => {
    expect(hasPermission('operator', 'claims.redeem')).toBe(true);
    expect(hasPermission('operator', 'crm.read')).toBe(false);
    expect(hasPermission('operator', 'crm.manage')).toBe(false);
    expect(hasPermission('operator', 'organization.manage')).toBe(false);
    expect(hasRole('operator', 'member')).toBe(false);
    expect(CRM_PERMISSIONS.filter((permission) => hasPermission('operator', permission))).toEqual(['claims.redeem']);
  });
  it('preserves existing role behavior and gives admins redemption access', () => {
    expect(hasPermission('viewer', 'organization.read')).toBe(true);
    expect(hasPermission('member', 'crm.read')).toBe(true);
    expect(hasPermission('member', 'claims.redeem')).toBe(false);
    expect(hasPermission('admin', 'claims.redeem')).toBe(true);
    expect(hasPermission('owner', 'crm.manage')).toBe(true);
  });
});
