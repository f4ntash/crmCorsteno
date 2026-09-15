/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Canonical production dataset maintenance.
 *
 * This file intentionally contains no credentials. It is a guarded, SQL-only
 * administrative script: it never exposes passwords and never uses HTTP.
 *
 * Examples (PowerShell):
 *   $env:ENVIRONMENT='production'
 *   $env:RESET_PRODUCTION_DATABASE='corsteno-db'
 *   $env:CANONICAL_BACKUP_PATH='C:\\...\\corsteno-db-production.sql'
 *   pnpm exec tsx scripts/seed-canonical-production.ts --clean --execute
 *   pnpm exec tsx scripts/seed-canonical-production.ts --seed --execute
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../apps/api/src/auth/crypto';

const DATABASE = 'corsteno-db';
const EXPECTED_BACKUP_DB = DATABASE;
const ROOT = path.resolve(process.cwd());
const LOCAL_ENV = path.join(ROOT, '.env.canonical-production.local');
const DEFAULT_EVENT_MAP =
  'C:\\Users\\Matu\\Documents\\ChatGPT\\Ar Corsquin\\corsteno-ar-demo\\docs\\cosquin-event-map.md';
const ADMIN_EMAIL = 'admin@corsteno.com';
const FURNITURE_ASSETS = [
  {
    id: '00000000-0000-4000-8000-000000000501',
    filename: 'sillon-modular.svg',
    name: 'Sillón modular',
  },
  {
    id: '00000000-0000-4000-8000-000000000502',
    filename: 'mesa-comedor.svg',
    name: 'Mesa de comedor',
  },
  {
    id: '00000000-0000-4000-8000-000000000503',
    filename: 'biblioteca.svg',
    name: 'Biblioteca',
  },
  {
    id: '00000000-0000-4000-8000-000000000504',
    filename: 'mesa-auxiliar.svg',
    name: 'Mesa auxiliar',
  },
] as const;
const COSQUIN_CANONICAL_EVENTS = [
  'app_opened',
  'session_started',
  'experience_started',
  'current_shows_viewed',
  'schedule_viewed',
  'map_viewed',
] as const;

const ids = {
  // Existing production admin organization, verified during the preflight audit.
  adminOrg: '0acb6eb9-1d42-4950-aa36-b9988637b53c',
  cosquinOrg: '00000000-0000-4000-8000-000000000002',
  mueblesOrg: '00000000-0000-4000-8000-000000000003',
  ruletaOrg: '00000000-0000-4000-8000-000000000004',
  cosquinProject: '00000000-0000-4000-8000-000000000011',
  mueblesProject: '00000000-0000-4000-8000-000000000012',
  ruletaProject: '00000000-0000-4000-8000-000000000013',
  cosquinApp: '00000000-0000-4000-8000-000000000021',
  mueblesApp: '00000000-0000-4000-8000-000000000022',
  ruletaApp: '00000000-0000-4000-8000-000000000023',
  cosquinExperience: '00000000-0000-4000-8000-000000000031',
  mueblesExperience: '00000000-0000-4000-8000-000000000032',
  ruletaExperience: '00000000-0000-4000-8000-000000000033',
};

const q = (value: string | number | null) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`;
const j = (value: unknown) => q(JSON.stringify(value));
const uuid = (prefix: string, n: number) =>
  `00000000-0000-4000-8000-${prefix}${String(n).padStart(12, '0')}`;

function assertProduction() {
  if (process.env.ENVIRONMENT !== 'production')
    throw new Error('Bloqueado: ENVIRONMENT debe ser production.');
  if (process.env.RESET_PRODUCTION_DATABASE !== EXPECTED_BACKUP_DB)
    throw new Error(
      `Bloqueado: RESET_PRODUCTION_DATABASE debe ser ${EXPECTED_BACKUP_DB}.`,
    );
  if (process.env.CANONICAL_BACKUP_DATABASE !== EXPECTED_BACKUP_DB)
    throw new Error(
      `Bloqueado: CANONICAL_BACKUP_DATABASE debe ser ${EXPECTED_BACKUP_DB}.`,
    );
  if (!process.argv.includes('--execute'))
    throw new Error('Bloqueado: falta --execute.');
  const backup = process.env.CANONICAL_BACKUP_PATH;
  if (!backup || !existsSync(backup) || statSync(backup).size <= 0)
    throw new Error(
      'Bloqueado: CANONICAL_BACKUP_PATH debe apuntar a un backup no vacío.',
    );
  const eventMap = process.env.CORSTENO_EVENT_MAP_PATH ?? DEFAULT_EVENT_MAP;
  if (!existsSync(eventMap))
    throw new Error(
      'Bloqueado: no se encontró el mapa de eventos de Cosquín en la ruta configurada.',
    );
  for (const key of [
    'CORSTENO_COSQUIN_PASSWORD',
    'CORSTENO_MUEBLES_PASSWORD',
    'CORSTENO_RULETA_PASSWORD',
  ]) {
    if (!process.env[key])
      throw new Error(`Bloqueado: falta variable local ${key}.`);
  }
}

function loadLocalEnvironment() {
  if (!existsSync(LOCAL_ENV)) return;
  const contents = readFileSync(LOCAL_ENV, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined)
      continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    process.env[key] = value;
  }
}

function cleanSql() {
  const keep = "('cosquin-rock','muebles-demo','ruleta-demo')";
  const orphan = `(organization_id NOT IN (SELECT id FROM organizations WHERE slug IN ${keep}) OR organization_id=(SELECT id FROM organizations WHERE slug='corsteno'))`;
  const orphanExperience = `(experience_id IN (SELECT id FROM experiences WHERE organization_id NOT IN (SELECT id FROM organizations WHERE slug IN ${keep}) OR organization_id=(SELECT id FROM organizations WHERE slug='corsteno'))) `;
  return [
    'PRAGMA foreign_keys=ON;',
    `DELETE FROM auth_sessions WHERE user_id NOT IN (SELECT id FROM users WHERE lower(email)=${q(ADMIN_EMAIL)} OR lower(email) IN ('cosquinrock@corsteno.com','muebles@corsteno.com','ruleta@corsteno.com'));`,
    `DELETE FROM app_sessions WHERE ${orphan};`,
    `DELETE FROM roulette_prize_claims WHERE ${orphan};`,
    `DELETE FROM experience_prize_inventory_events WHERE ${orphanExperience};`,
    `DELETE FROM experience_prize_inventory WHERE ${orphanExperience};`,
    `DELETE FROM experience_participation WHERE ${orphan};`,
    `DELETE FROM experience_spins WHERE ${orphan};`,
    `DELETE FROM experience_access_periods WHERE ${orphan};`,
    `DELETE FROM subscription_experiences WHERE ${orphan};`,
    `DELETE FROM channel_content WHERE ${orphan};`,
    `DELETE FROM channel_products WHERE ${orphan};`,
    `DELETE FROM channel_published_products WHERE ${orphan};`,
    `DELETE FROM experience_channels WHERE ${orphan};`,
    `DELETE FROM product_3d_config WHERE ${orphan};`,
    `DELETE FROM product_images WHERE ${orphan};`,
    `DELETE FROM product_published_images WHERE ${orphan};`,
    `DELETE FROM catalog_product_images WHERE ${orphan};`,
    `DELETE FROM catalog_published_product_images WHERE ${orphan};`,
    `DELETE FROM catalog_experience_products WHERE ${orphan};`,
    `DELETE FROM catalog_published_experience_products WHERE ${orphan};`,
    `DELETE FROM products WHERE ${orphan};`,
    `DELETE FROM catalog_products WHERE ${orphan};`,
    `DELETE FROM catalog_published_products WHERE ${orphan};`,
    `DELETE FROM channels WHERE ${orphan};`,
    `DELETE FROM experiences WHERE ${orphan};`,
    `DELETE FROM commercial_grants WHERE ${orphan};`,
    `DELETE FROM subscription_periods WHERE ${orphan};`,
    `DELETE FROM commercial_payments WHERE ${orphan};`,
    `DELETE FROM subscriptions WHERE ${orphan};`,
    `DELETE FROM events WHERE ${orphan};`,
    `DELETE FROM applications WHERE ${orphan};`,
    `DELETE FROM projects WHERE ${orphan};`,
    `DELETE FROM organization_activity WHERE ${orphan};`,
    `DELETE FROM organization_assets WHERE ${orphan};`,
    `DELETE FROM crm_notes WHERE ${orphan};`,
    `DELETE FROM crm_contacts WHERE ${orphan};`,
    `DELETE FROM crm_leads WHERE ${orphan};`,
    `DELETE FROM leads WHERE ${orphan};`,
    `DELETE FROM lead_jobs WHERE ${orphan};`,
    "DELETE FROM memberships WHERE NOT (user_id=(SELECT id FROM users WHERE lower(email)='admin@corsteno.com') AND organization_id=(SELECT id FROM organizations WHERE slug='corsteno') AND role='owner' AND status='active') AND organization_id NOT IN (SELECT id FROM organizations WHERE slug IN ('cosquin-rock','muebles-demo','ruleta-demo'));",
    "DELETE FROM users WHERE lower(email) NOT IN ('admin@corsteno.com','cosquinrock@corsteno.com','muebles@corsteno.com','ruleta@corsteno.com');",
    "DELETE FROM organizations WHERE slug NOT IN ('corsteno','cosquin-rock','muebles-demo','ruleta-demo');",
  ].join('\n');
}

function rouletteConfig() {
  return {
    schemaVersion: 1,
    backgroundColor: '#172331',
    content: {
      title: 'Ruleta de beneficios',
      intro: 'Girá y descubrí tu beneficio para tu próxima compra.',
      spinButtonLabel: 'Girar ahora',
      winMessage: '¡Felicitaciones! Tu beneficio está listo.',
      noPrizeMessage: 'Esta vez no hubo premio. Gracias por participar.',
    },
    resultCta: {
      enabled: true,
      label: 'Hablar por WhatsApp',
      url: 'https://wa.me/5493515550199',
    },
    participation: {
      maxSpinsPerDevice: 1,
      maxSpinsPerSession: 1,
      cooldownSeconds: 0,
    },
    effects: { sound: true, vibration: true, celebration: true },
    prizes: [
      {
        id: 'discount-10',
        name: '10% de descuento',
        enabled: true,
        weight: 5,
        stockMode: 'unlimited',
        redemption: { enabled: true },
      },
      {
        id: 'discount-15',
        name: '15% de descuento',
        enabled: true,
        weight: 3,
        stockMode: 'limited',
        initialStock: 40,
        redemption: { enabled: true },
      },
      {
        id: 'free-shipping',
        name: 'Envío gratis',
        enabled: true,
        weight: 2,
        stockMode: 'limited',
        initialStock: 25,
        redemption: { enabled: true },
      },
      {
        id: 'special-gift',
        name: 'Regalo especial',
        enabled: true,
        weight: 1,
        stockMode: 'limited',
        initialStock: 12,
        redemption: { enabled: false },
      },
    ],
    segments: [
      ['discount-10', '#D6B25E'],
      ['discount-15', '#79A7D3'],
      ['free-shipping', '#9BC47D'],
      [null, '#C0A1D8'],
      ['special-gift', '#D88C8C'],
      ['discount-10', '#6FB6A8'],
      ['discount-15', '#E0A15B'],
      [null, '#8E9CC8'],
    ].map(([prizeId, color], index) => ({
      id: `segment-${index + 1}`,
      prizeId,
      color,
    })),
  };
}

function eventSql(
  org: string,
  project: string,
  app: string,
  experience: string,
  event: string,
  index: number,
  daysAgo: number,
  properties: Record<string, unknown> = {},
) {
  const occurred = Date.now() - daysAgo * 86_400_000 + (index % 9) * 3_600_000;
  return `INSERT OR IGNORE INTO events (id,organization_id,project_id,application_id,event_name,anonymous_user_id,session_id,properties,occurred_at,created_at) VALUES (${q(uuid(org.replaceAll('-', '').slice(-12), index))},${q(org)},${q(project)},${q(app)},${q(event)},${q(`canonical-seed-user-${index % 50}`)},${q(`canonical-seed-session-${index}`)},${j({ ...properties, source: 'canonical_seed', experienceId: experience })},${occurred},${occurred});`;
}

function seedSql(hashes: { cosquin: string; muebles: string; ruleta: string }) {
  const now = Date.now();
  const catalogConfig = {
    schemaVersion: 1,
    title: 'Muebles Demo',
    intro: 'Muebles honestos para espacios vividos.',
  };
  const roulette = rouletteConfig();
  const products = [
    [
      '00000000-0000-4000-8000-000000000101',
      'mesa-comedor',
      'Mesa de comedor',
      'Roble macizo, líneas suaves y espacio para compartir.',
      18900000,
      8,
    ],
    [
      '00000000-0000-4000-8000-000000000102',
      'sillon-nordico',
      'Sillón nórdico',
      'Estructura firme y tapizado cálido para descansar.',
      12900000,
      5,
    ],
    [
      '00000000-0000-4000-8000-000000000103',
      'biblioteca-roble',
      'Biblioteca de roble',
      'Cinco estantes abiertos para libros y objetos favoritos.',
      21500000,
      4,
    ],
    [
      '00000000-0000-4000-8000-000000000104',
      'mesa-auxiliar',
      'Mesa auxiliar',
      'Superficie compacta para acompañar un sofá o una lectura.',
      6900000,
      12,
    ],
  ] as const;
  const furnitureAsset = (index: number) => FURNITURE_ASSETS[index]!;
  const sql: string[] = ['PRAGMA foreign_keys=ON;'];
  sql.push(
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${q(ids.adminOrg)},'Corsteno','corsteno','active',${now},${now}) ON CONFLICT(id) DO UPDATE SET status='active',updated_at=excluded.updated_at;`,
  );
  for (const [id, name, slug] of [
    [ids.cosquinOrg, 'Cosquín Rock', 'cosquin-rock'],
    [ids.mueblesOrg, 'Muebles Demo', 'muebles-demo'],
    [ids.ruletaOrg, 'Ruleta Demo', 'ruleta-demo'],
  ] as const)
    sql.push(
      `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${q(id)},${q(name)},${q(slug)},'active',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status='active',updated_at=excluded.updated_at;`,
    );
  const user = (id: string, email: string, name: string, hash: string) =>
    `INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (${q(id)},${q(email)},${q(email)},${q(name)},'active',${q(hash)},'user',${now},${now}) ON CONFLICT DO UPDATE SET email=excluded.email,email_normalized=excluded.email_normalized,name=excluded.name,status='active',password_hash=excluded.password_hash,platform_role='user',updated_at=excluded.updated_at;`;
  sql.push(
    user(
      '00000000-0000-4000-8000-000000000201',
      'cosquinrock@corsteno.com',
      'Cosquín Rock',
      hashes.cosquin,
    ),
  );
  sql.push(
    user(
      '00000000-0000-4000-8000-000000000202',
      'muebles@corsteno.com',
      'Muebles Demo',
      hashes.muebles,
    ),
  );
  sql.push(
    user(
      '00000000-0000-4000-8000-000000000203',
      'ruleta@corsteno.com',
      'Ruleta Demo',
      hashes.ruleta,
    ),
  );
  sql.push(
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) SELECT ${q(uuid('000000000000', 201))},u.id,${q(ids.cosquinOrg)},'owner','active',${now},${now} FROM users u WHERE u.email_normalized='cosquinrock@corsteno.com' ON CONFLICT(user_id,organization_id) DO UPDATE SET role='owner',status='active',updated_at=excluded.updated_at;`,
  );
  sql.push(
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) SELECT ${q(uuid('000000000000', 202))},u.id,${q(ids.mueblesOrg)},'owner','active',${now},${now} FROM users u WHERE u.email_normalized='muebles@corsteno.com' ON CONFLICT(user_id,organization_id) DO UPDATE SET role='owner',status='active',updated_at=excluded.updated_at;`,
  );
  sql.push(
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) SELECT ${q(uuid('000000000000', 203))},u.id,${q(ids.ruletaOrg)},'owner','active',${now},${now} FROM users u WHERE u.email_normalized='ruleta@corsteno.com' ON CONFLICT(user_id,organization_id) DO UPDATE SET role='owner',status='active',updated_at=excluded.updated_at;`,
  );
  sql.push(
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) SELECT ${q(uuid('000000000000', 204))},u.id,${q(ids.adminOrg)},'owner','active',${now},${now} FROM users u WHERE u.email_normalized='${ADMIN_EMAIL}' ON CONFLICT(user_id,organization_id) DO UPDATE SET role='owner',status='active',updated_at=excluded.updated_at;`,
  );
  const context = (
    project: string,
    app: string,
    org: string,
    type: string,
    name: string,
    slug: string,
    experience: string,
    config: unknown,
  ) => {
    sql.push(
      `INSERT INTO projects (id,organization_id,name,slug,status,description,created_at,updated_at) VALUES (${q(project)},${q(org)},${q(name)},${q(slug)},'active',${j({ canonical: true })},${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status='active',updated_at=excluded.updated_at;`,
    );
    sql.push(
      `INSERT INTO applications (id,organization_id,project_id,name,slug,status,application_type,created_at,updated_at) VALUES (${q(app)},${q(org)},${q(project)},${q(name)},${q(slug)},'active',${q(type)},${now},${now}) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,name=excluded.name,application_type=excluded.application_type,status='active',updated_at=excluded.updated_at;`,
    );
    sql.push(
      `INSERT INTO experiences (id,organization_id,name,slug,type,status,schema_version,draft_config,published_config,project_id,application_id,created_at,updated_at) VALUES (${q(experience)},${q(org)},${q(name)},${q(slug)},${q(type)},'published',1,${j(config)},${j(config)},${q(project)},${q(app)},${q(new Date(now).toISOString())},${q(new Date(now).toISOString())}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,status='published',draft_config=excluded.draft_config,published_config=excluded.published_config,project_id=excluded.project_id,application_id=excluded.application_id,updated_at=excluded.updated_at;`,
    );
  };
  context(
    ids.cosquinProject,
    ids.cosquinApp,
    ids.cosquinOrg,
    'webar',
    'Cosquín Rock AR',
    'cosquin-rock-ar',
    ids.cosquinExperience,
    { schemaVersion: 1 },
  );
  context(
    ids.mueblesProject,
    ids.mueblesApp,
    ids.mueblesOrg,
    'product-catalog',
    'Muebles Demo',
    'muebles-demo-catalogo',
    ids.mueblesExperience,
    catalogConfig,
  );
  context(
    ids.ruletaProject,
    ids.ruletaApp,
    ids.ruletaOrg,
    'roulette',
    'Ruleta Demo',
    'ruleta-demo',
    ids.ruletaExperience,
    roulette,
  );
  for (const asset of FURNITURE_ASSETS) {
    const storageKey = `organizations/${ids.mueblesOrg}/assets/${asset.id}.svg`;
    const assetFile = path.join(
      ROOT,
      'scripts',
      'canonical-assets',
      'muebles',
      asset.filename,
    );
    const byteSize = existsSync(assetFile) ? statSync(assetFile).size : 0;
    sql.push(
      `INSERT INTO organization_assets (id,organization_id,storage_key,original_filename,display_name,mime_type,byte_size,category,created_by,created_at,updated_at,archived_at) VALUES (${q(asset.id)},${q(ids.mueblesOrg)},${q(storageKey)},${q(asset.filename)},${q(asset.name)},'image/svg+xml',${byteSize},'image',NULL,${now},${now},NULL) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,storage_key=excluded.storage_key,original_filename=excluded.original_filename,display_name=excluded.display_name,mime_type=excluded.mime_type,byte_size=excluded.byte_size,category='image',updated_at=excluded.updated_at,archived_at=NULL;`,
    );
  }
  sql.push(
    `INSERT INTO channels (id,organization_id,name,type,status,url,created_at,updated_at) VALUES (${q(uuid('000000000000', 301))},${q(ids.cosquinOrg)},'Cosquín Rock AR','external_site','active','https://cosquinrock.corsteno.com/',${now},${now}) ON CONFLICT(id) DO UPDATE SET url=excluded.url,status='active',updated_at=excluded.updated_at;`,
  );
  sql.push(
    `INSERT OR IGNORE INTO experience_channels (id,organization_id,experience_id,channel_id,created_at) SELECT '00000000-0000-4000-8000-000000000311',${q(ids.cosquinOrg)},e.id,c.id,${now} FROM experiences e JOIN channels c ON c.organization_id=e.organization_id WHERE e.id=${q(ids.cosquinExperience)} AND e.organization_id=${q(ids.cosquinOrg)} AND c.id=${q(uuid('000000000000', 301))} AND c.type='external_site' AND c.status='active' AND c.url='https://cosquinrock.corsteno.com/';`,
  );
  for (const [org, exp, n] of [
    [ids.mueblesOrg, ids.mueblesExperience, 302],
    [ids.ruletaOrg, ids.ruletaExperience, 303] as const,
  ]) {
    const ch = uuid('000000000000', n);
    sql.push(
      `INSERT INTO channels (id,organization_id,name,type,status,url,created_at,updated_at) VALUES (${q(ch)},${q(org)},'Canal público','hosted_runtime','active',NULL,${now},${now}) ON CONFLICT(id) DO UPDATE SET status='active',updated_at=excluded.updated_at;`,
    );
    sql.push(
      `INSERT OR IGNORE INTO experience_channels (id,organization_id,experience_id,channel_id,created_at) VALUES (${q(uuid('000000000000', n + 10))},${q(org)},${q(exp)},${q(ch)},${now});`,
    );
  }
  for (const [
    i,
    [id, key, name, description, price, stock],
  ] of products.entries()) {
    const url = `https://wa.me/5493515550199?text=${encodeURIComponent(`Consulta ${name}`)}`;
    const asset = furnitureAsset(i);
    const image = `https://api.corsteno.com/assets/organizations/${ids.mueblesOrg}/assets/${asset.id}.svg`;
    const published = j({
      name,
      description,
      priceMinorUnits: price,
      currency: 'ARS',
      stock,
      mainImageUrl: image,
      ctaLabel: 'Consultar disponibilidad',
      ctaUrl: url,
    });
    sql.push(
      `INSERT INTO products (id,organization_id,product_key,name,description,price_minor_units,currency,stock,main_asset_url,cta_label,cta_url,status,published_content,published_at,created_at,updated_at) VALUES (${q(id)},${q(ids.mueblesOrg)},${q(key)},${q(name)},${q(description)},${price},'ARS',${stock},${q(image)},'Consultar disponibilidad',${q(url)},'active',${published},${now},${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,price_minor_units=excluded.price_minor_units,stock=excluded.stock,main_asset_url=excluded.main_asset_url,cta_label=excluded.cta_label,cta_url=excluded.cta_url,status='active',published_content=excluded.published_content,published_at=excluded.published_at,updated_at=excluded.updated_at;`,
    );
    const legacyId = uuid('000000000000', 601 + i);
    const legacyPublishedId = uuid('000000000000', 611 + i);
    sql.push(
      `INSERT INTO catalog_products (id,organization_id,experience_id,name,description,price_minor_units,currency,stock,sort_order,visible,main_asset_url,cta_label,cta_url,created_at,updated_at) VALUES (${q(legacyId)},${q(ids.mueblesOrg)},${q(ids.mueblesExperience)},${q(name)},${q(description)},${price},'ARS',${stock},${i},1,${q(image)},'Consultar disponibilidad',${q(url)},${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,price_minor_units=excluded.price_minor_units,stock=excluded.stock,sort_order=excluded.sort_order,visible=1,main_asset_url=excluded.main_asset_url,cta_label=excluded.cta_label,cta_url=excluded.cta_url,updated_at=excluded.updated_at;`,
    );
    sql.push(
      `INSERT INTO catalog_published_products (id,organization_id,experience_id,source_product_id,name,description,price_minor_units,currency,stock,sort_order,main_asset_url,cta_label,cta_url,published_at) VALUES (${q(legacyPublishedId)},${q(ids.mueblesOrg)},${q(ids.mueblesExperience)},${q(legacyId)},${q(name)},${q(description)},${price},'ARS',${stock},${i},${q(image)},'Consultar disponibilidad',${q(url)},${now}) ON CONFLICT(id) DO UPDATE SET source_product_id=excluded.source_product_id,name=excluded.name,description=excluded.description,price_minor_units=excluded.price_minor_units,stock=excluded.stock,sort_order=excluded.sort_order,main_asset_url=excluded.main_asset_url,cta_label=excluded.cta_label,cta_url=excluded.cta_url,published_at=excluded.published_at;`,
    );
    sql.push(
      `INSERT OR IGNORE INTO catalog_experience_products (id,organization_id,experience_id,product_id,sort_order,visible,created_at,updated_at) VALUES (${q(uuid('000000000000', 401 + i))},${q(ids.mueblesOrg)},${q(ids.mueblesExperience)},${q(id)},${i},1,${now},${now});`,
    );
    sql.push(
      `INSERT OR IGNORE INTO catalog_published_experience_products (id,organization_id,experience_id,product_id,sort_order,visible,published_at) VALUES (${q(uuid('000000000000', 411 + i))},${q(ids.mueblesOrg)},${q(ids.mueblesExperience)},${q(id)},${i},1,${now});`,
    );
  }
  sql.push(
    `DELETE FROM catalog_published_experience_products WHERE experience_id=${q(ids.mueblesExperience)} AND product_id NOT IN (${products.map((p) => q(p[0])).join(',')});`,
  );
  for (const prize of roulette.prizes as Array<{
    id: string;
    name: string;
    stockMode: string;
    initialStock?: number;
  }>)
    sql.push(
      `INSERT INTO experience_prize_inventory (experience_id,prize_id,stock_mode,stock_available,delivered_count) VALUES (${q(ids.ruletaExperience)},${q(prize.id)},${q(prize.stockMode)},${prize.stockMode === 'limited' ? (prize.initialStock ?? 0) : null},0) ON CONFLICT(experience_id,prize_id) DO UPDATE SET stock_mode=excluded.stock_mode,stock_available=excluded.stock_available;`,
    );
  for (let day = 1; day <= 40; day++) {
    const v = 8 + ((day * 17) % 23);
    for (let i = 0; i < v; i++)
      sql.push(
        eventSql(
          ids.cosquinOrg,
          ids.cosquinProject,
          ids.cosquinApp,
          ids.cosquinExperience,
          COSQUIN_CANONICAL_EVENTS[i % COSQUIN_CANONICAL_EVENTS.length],
          day * 100 + i,
          day,
        ),
      );
    const visits = 5 + ((day * 7) % 14);
    for (let i = 0; i < visits; i++)
      sql.push(
        eventSql(
          ids.mueblesOrg,
          ids.mueblesProject,
          ids.mueblesApp,
          ids.mueblesExperience,
          'experience_view',
          day * 1000 + i,
          day,
        ),
      );
    for (let i = 0; i < Math.max(1, Math.floor(visits * 0.55)); i++)
      sql.push(
        eventSql(
          ids.ruletaOrg,
          ids.ruletaProject,
          ids.ruletaApp,
          ids.ruletaExperience,
          'experience_view',
          day * 2000 + i,
          day,
        ),
      );
    for (let i = 0; i < Math.max(1, Math.floor(visits * 0.32)); i++)
      sql.push(
        eventSql(
          ids.ruletaOrg,
          ids.ruletaProject,
          ids.ruletaApp,
          ids.ruletaExperience,
          'roulette_spin_completed',
          day * 3000 + i,
          day,
          { result: i % 4 ? 'prize' : 'no_prize' },
        ),
      );
    const spinCount = Math.max(2, Math.floor(visits * 0.32));
    for (let i = 0; i < spinCount; i++) {
      const spinNumber = day * 10000 + i;
      const won = i % 4 !== 0;
      const prizeId = won
        ? ['discount-10', 'discount-15', 'free-shipping'][i % 3]
        : null;
      const segmentIndex = won ? i % 7 : 3;
      const occurredAt = new Date(
        Date.now() - day * 86_400_000 + (i % 9) * 3_600_000,
      ).toISOString();
      const spinId = uuid('ruletaspin00', spinNumber);
      sql.push(
        `INSERT OR IGNORE INTO experience_spins (id,experience_id,organization_id,application_id,segment_id,segment_index,prize_id,outcome_type,created_at,participant_device_id,participant_session_id) VALUES (${q(spinId)},${q(ids.ruletaExperience)},${q(ids.ruletaOrg)},${q(ids.ruletaApp)},${q(`segment-${segmentIndex + 1}`)},${segmentIndex},${q(prizeId)},${q(won ? 'prize' : 'no_prize')},${q(occurredAt)},${q(`canonical-seed-device-${spinNumber}`)},${q(`canonical-seed-session-${spinNumber}`)});`,
      );
      if (won) {
        sql.push(
          `INSERT OR IGNORE INTO roulette_prize_claims (id,code,organization_id,experience_id,spin_id,prize_id,prize_name,status,created_at) VALUES (${q(uuid('ruletaclaim0', spinNumber))},${q(`CANONICAL-${String(spinNumber).padStart(8, '0')}`)},${q(ids.ruletaOrg)},${q(ids.ruletaExperience)},${q(spinId)},${q(prizeId)},${q(prizeId === 'discount-10' ? '10% de descuento' : prizeId === 'discount-15' ? '15% de descuento' : 'Envío gratis')},${q(i % 5 === 0 ? 'redeemed' : 'active')},${q(occurredAt)});`,
        );
      }
    }
  }
  return sql.join('\n');
}

async function executeSql(sql: string) {
  const file = path.join(
    os.tmpdir(),
    `corsteno-canonical-${process.pid}-${Date.now()}.sql`,
  );
  await writeFile(file, sql, { encoding: 'utf8', flag: 'wx' });
  try {
    execSync(
      `pnpm --dir apps/api exec wrangler d1 execute ${DATABASE} --remote --file ${JSON.stringify(file)}`,
      { cwd: ROOT, stdio: 'inherit', shell: true },
    );
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

function uploadFurnitureAssets() {
  for (const asset of FURNITURE_ASSETS) {
    const file = path.join(
      ROOT,
      'scripts',
      'canonical-assets',
      'muebles',
      asset.filename,
    );
    if (!existsSync(file) || statSync(file).size <= 0)
      throw new Error(`Falta el asset local requerido: ${asset.filename}.`);
    const key = `organizations/${ids.mueblesOrg}/assets/${asset.id}.svg`;
    execSync(
      `pnpm --dir apps/api exec wrangler r2 object put ${JSON.stringify(`corsteno-experience-assets/${key}`)} --remote --file ${JSON.stringify(file)} --content-type image/svg+xml --force`,
      { cwd: ROOT, stdio: 'inherit', shell: true },
    );
  }
}

function reportPreconditions() {
  loadLocalEnvironment();
  for (const key of [
    'CORSTENO_COSQUIN_PASSWORD',
    'CORSTENO_MUEBLES_PASSWORD',
    'CORSTENO_RULETA_PASSWORD',
  ])
    console.log(`${key}: ${process.env[key] ? 'PRESENT' : 'MISSING'}`);
  const eventMap = process.env.CORSTENO_EVENT_MAP_PATH ?? DEFAULT_EVENT_MAP;
  console.log(
    `Cosquín event map: ${existsSync(eventMap) ? 'FOUND' : 'NOT FOUND'}`,
  );
  const assetsReady = FURNITURE_ASSETS.every((asset) => {
    const file = path.join(
      ROOT,
      'scripts',
      'canonical-assets',
      'muebles',
      asset.filename,
    );
    return existsSync(file) && statSync(file).size > 0;
  });
  console.log(`Furniture assets: ${assetsReady ? 'READY' : 'NOT READY'}`);
}

async function main() {
  loadLocalEnvironment();
  if (process.argv.includes('--check-preconditions')) {
    reportPreconditions();
    return;
  }
  const operation = process.argv.includes('--clean')
    ? 'clean'
    : process.argv.includes('--seed')
      ? 'seed'
      : null;
  if (
    !operation ||
    (process.argv.includes('--clean') && process.argv.includes('--seed'))
  )
    throw new Error('Elegí exactamente una operación: --clean o --seed.');
  assertProduction();
  if (operation === 'clean') await executeSql(cleanSql());
  else {
    uploadFurnitureAssets();
    const [cosquin, muebles, ruleta] = await Promise.all([
      hashPassword(process.env.CORSTENO_COSQUIN_PASSWORD!),
      hashPassword(process.env.CORSTENO_MUEBLES_PASSWORD!),
      hashPassword(process.env.CORSTENO_RULETA_PASSWORD!),
    ]);
    await executeSql(seedSql({ cosquin, muebles, ruleta }));
  }
  console.log(`Canonical production ${operation} completed for ${DATABASE}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
