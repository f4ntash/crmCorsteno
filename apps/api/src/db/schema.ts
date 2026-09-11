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
export const organizationActivity = sqliteTable(
  'organization_activity',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    actorUserId: text('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    metadata: text('metadata', { mode: 'json' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('organization_activity_org_created').on(t.organizationId, t.createdAt),
    index('organization_activity_action').on(t.organizationId, t.action),
    index('organization_activity_actor').on(t.organizationId, t.actorUserId),
  ],
);
export const organizationAssets = sqliteTable(
  'organization_assets',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    displayName: text('display_name').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    category: text('category').notNull().default('image'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('organization_assets_storage_key').on(t.storageKey),
    index('organization_assets_org_created').on(t.organizationId, t.createdAt),
    index('organization_assets_org_category').on(t.organizationId, t.category, t.archivedAt),
  ],
);
export const catalogProducts = sqliteTable(
  'catalog_products',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    experienceId: text('experience_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    priceMinorUnits: integer('price_minor_units').notNull().default(0),
    currency: text('currency').notNull().default('ARS'),
    stock: integer('stock').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
    mainAssetUrl: text('main_asset_url'),
    ctaLabel: text('cta_label'),
    ctaUrl: text('cta_url'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('catalog_products_experience').on(t.experienceId, t.organizationId), index('catalog_products_order').on(t.experienceId, t.organizationId, t.sortOrder, t.id), index('catalog_products_visible').on(t.experienceId, t.visible, t.archivedAt)],
);
export const catalogPublishedProducts = sqliteTable(
  'catalog_published_products',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    experienceId: text('experience_id').notNull(),
    sourceProductId: text('source_product_id'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    priceMinorUnits: integer('price_minor_units').notNull().default(0),
    currency: text('currency').notNull().default('ARS'),
    stock: integer('stock').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    mainAssetUrl: text('main_asset_url'),
    ctaLabel: text('cta_label'),
    ctaUrl: text('cta_url'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('catalog_published_products_experience').on(t.experienceId, t.organizationId), index('catalog_published_products_order').on(t.experienceId, t.organizationId, t.sortOrder, t.id)],
);
export const catalogProductImages = sqliteTable(
  'catalog_product_images',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    experienceId: text('experience_id').notNull(),
    productId: text('product_id').notNull().references(() => catalogProducts.id),
    assetId: text('asset_id').notNull().references(() => organizationAssets.id),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('catalog_product_images_product_asset').on(t.productId, t.assetId), index('catalog_product_images_product').on(t.productId, t.organizationId, t.sortOrder, t.id)],
);
export const catalogPublishedProductImages = sqliteTable(
  'catalog_published_product_images',
  {
    id: id(),
    organizationId: text('organization_id').notNull().references(() => organizations.id),
    experienceId: text('experience_id').notNull(),
    publishedProductId: text('published_product_id').notNull().references(() => catalogPublishedProducts.id),
    sourceImageId: text('source_image_id'),
    assetUrl: text('asset_url').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('catalog_published_product_images_product').on(t.publishedProductId, t.organizationId, t.sortOrder, t.id)],
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
export const roulettePrizeClaims = sqliteTable('roulette_prize_claims', {
  id: id(),
  code: text('code').notNull(),
  organizationId: text('organization_id').notNull(),
  experienceId: text('experience_id').notNull(),
  spinId: text('spin_id').notNull(),
  prizeId: text('prize_id').notNull(),
  prizeName: text('prize_name').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  redeemedAt: text('redeemed_at'),
  redeemedBy: text('redeemed_by'),
}, (t) => [uniqueIndex('roulette_prize_claims_code').on(t.code), uniqueIndex('roulette_prize_claims_spin').on(t.spinId), index('roulette_prize_claims_experience').on(t.experienceId, t.createdAt)]);
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

export const commercialPayments = sqliteTable(
  'commercial_payments',
  {
    id: id(),
    organizationId: text('organization_id').notNull(),
    subscriptionId: text('subscription_id').notNull(),
    paymentSource: text('payment_source').notNull(),
    provider: text('provider'),
    paymentMethod: text('payment_method'),
    providerPaymentId: text('provider_payment_id'),
    providerCheckoutId: text('provider_checkout_id'),
    status: text('status').notNull(),
    providerStatus: text('provider_status'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    reference: text('reference'),
    note: text('note'),
    createdBy: text('created_by'),
    idempotencyKey: text('idempotency_key'),
    metadata: text('metadata'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    paidAt: text('paid_at'),
  },
  (t) => [
    uniqueIndex('commercial_payments_provider_payment').on(t.provider, t.providerPaymentId),
    uniqueIndex('commercial_payments_provider_checkout').on(t.provider, t.providerCheckoutId),
    index('commercial_payments_org').on(t.organizationId, t.createdAt),
  ],
);

export const channels = sqliteTable(
  'channels',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('active'),
    url: text('url'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('channels_organization_name').on(t.organizationId, t.name),
    index('channels_organization_status').on(t.organizationId, t.status, t.name),
  ],
);

export const experienceChannels = sqliteTable(
  'experience_channels',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    experienceId: text('experience_id').notNull(),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('experience_channels_experience_channel').on(t.experienceId, t.channelId),
    index('experience_channels_channel').on(t.channelId, t.organizationId),
    index('experience_channels_organization').on(t.organizationId, t.experienceId),
  ],
);
