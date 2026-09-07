import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
};
export const organizations = sqliteTable(
  'organizations',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('organizations_slug').on(t.slug)],
);
export const users = sqliteTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull(),
    passwordHash: text('password_hash').notNull(),
    platformRole: text('platform_role').notNull().default('user'),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email').on(t.emailNormalized)],
);
export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => [
    uniqueIndex('auth_sessions_token').on(t.tokenHash),
    index('auth_sessions_user').on(t.userId),
  ],
);
export const applicationCredentials = sqliteTable(
  'application_credentials',
  {
    id: id(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id),
    keyPrefix: text('key_prefix').notNull(),
    secretHash: text('secret_hash').notNull(),
    status: text('status').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  },
  (t) => [uniqueIndex('application_credentials_hash').on(t.secretHash)],
);
export const memberships = sqliteTable(
  'memberships',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    role: text('role').notNull(),
    status: text('status').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('memberships_user_org').on(t.userId, t.organizationId),
    index('memberships_org').on(t.organizationId),
  ],
);
export const projects = sqliteTable(
  'projects',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status').notNull(),
    description: text('description'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('projects_org_slug').on(t.organizationId, t.slug),
    index('projects_org').on(t.organizationId),
  ],
);
export const applications = sqliteTable(
  'applications',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status').notNull(),
    applicationType: text('application_type').notNull().default('generic'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('applications_project_slug').on(t.projectId, t.slug),
    index('applications_org').on(t.organizationId),
  ],
);
export const events = sqliteTable(
  'events',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id),
    eventName: text('event_name').notNull(),
    anonymousUserId: text('anonymous_user_id'),
    sessionId: text('session_id'),
    properties: text('properties', { mode: 'json' }),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('events_org_time').on(t.organizationId, t.occurredAt),
    index('events_project').on(t.projectId),
    index('events_application').on(t.applicationId),
    index('events_name').on(t.eventName),
    index('events_anonymous').on(t.anonymousUserId),
    index('events_session').on(t.sessionId),
  ],
);
export const appSessions = sqliteTable('app_sessions', {
  id: id(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  applicationId: text('application_id')
    .notNull()
    .references(() => applications.id),
  anonymousUserId: text('anonymous_user_id'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export const prizes = sqliteTable(
  'prizes',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status').notNull(),
    description: text('description'),
    ...timestamps,
  },
  (t) => [uniqueIndex('prizes_project_slug').on(t.projectId, t.slug)],
);
export const prizeClaims = sqliteTable('prize_claims', {
  id: id(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  applicationId: text('application_id').references(() => applications.id),
  prizeId: text('prize_id')
    .notNull()
    .references(() => prizes.id),
  anonymousUserId: text('anonymous_user_id'),
  eventId: text('event_id').references(() => events.id),
  status: text('status').notNull(),
  claimedAt: integer('claimed_at', { mode: 'timestamp_ms' }),
  ...timestamps,
});
export const crmLeads = sqliteTable(
  'crm_leads',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    company: text('company'),
    email: text('email'),
    phone: text('phone'),
    status: text('status').notNull(),
    source: text('source'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('crm_leads_org').on(t.organizationId)],
);
export const crmContacts = sqliteTable('crm_contacts', {
  id: id(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  company: text('company'),
  email: text('email'),
  phone: text('phone'),
  notes: text('notes'),
  ...timestamps,
});
export const crmNotes = sqliteTable(
  'crm_notes',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    content: text('content').notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index('crm_notes_entity').on(t.organizationId, t.entityType, t.entityId),
  ],
);
