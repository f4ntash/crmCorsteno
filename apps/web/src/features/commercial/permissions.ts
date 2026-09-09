export function isPlatformCommercialAdmin(platformRole: string | null | undefined) {
  return platformRole === 'super_admin' || platformRole === 'corsteno_admin';
}
