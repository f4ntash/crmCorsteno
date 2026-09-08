export type Me = {
  user: { name: string; platformRole: string };
  memberships: { organizationId: string; organizationName: string; role: string; permissions: string[] }[];
};
