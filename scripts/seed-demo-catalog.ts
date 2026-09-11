// LOCAL DEVELOPMENT ONLY — NEVER USE IN PRODUCTION
// This script always targets Wrangler's development D1/R2 bindings with --local.
import { execFileSync } from 'node:child_process';
import { stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDirectory = path.join(root, 'apps', 'api');
const wranglerScript = path.join(apiDirectory, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const localBucket = 'corsteno-experience-assets';
const localApiOrigin = 'http://localhost:8787';

const demo = {
  organizationId: '00000000-0000-4000-8000-000000000070',
  organizationSlug: 'lumbre-norte-demo',
  projectId: '00000000-0000-4000-8000-000000000071',
  applicationId: '00000000-0000-4000-8000-000000000072',
  experienceId: '00000000-0000-4000-8000-000000000073',
};

type AssetDefinition = {
  id: string;
  filename: string;
  displayName: string;
};

const assets: AssetDefinition[] = [
  { id: '00000000-0000-4000-8000-000000000090', filename: 'nido-main.png', displayName: 'Lámpara Nido — vista principal' },
  { id: '00000000-0000-4000-8000-000000000091', filename: 'nido-detail.png', displayName: 'Lámpara Nido — detalle' },
  { id: '00000000-0000-4000-8000-000000000092', filename: 'nido-context.png', displayName: 'Lámpara Nido — ambiente' },
  { id: '00000000-0000-4000-8000-000000000093', filename: 'bruma-main.png', displayName: 'Lámpara Bruma — vista principal' },
  { id: '00000000-0000-4000-8000-000000000094', filename: 'alba-main.png', displayName: 'Lámpara Alba — vista principal' },
  { id: '00000000-0000-4000-8000-000000000095', filename: 'linea-main.png', displayName: 'Aplique Línea — vista principal' },
  { id: '00000000-0000-4000-8000-000000000096', filename: 'norte-main.png', displayName: 'Perfil Norte — vista principal' },
  { id: '00000000-0000-4000-8000-000000000097', filename: 'veta-main.png', displayName: 'Plafón Veta — vista principal' },
];

const products = [
  {
    id: '00000000-0000-4000-8000-000000000074',
    name: 'Lámpara Nido',
    description: 'Pantalla textil de silueta orgánica para comedores y espacios de encuentro.',
    priceMinorUnits: 18_900_000,
    stock: 12,
    sortOrder: 0,
    asset: assets[0]!,
    gallery: [assets[1]!, assets[2]!],
  },
  {
    id: '00000000-0000-4000-8000-000000000075',
    name: 'Lámpara Bruma',
    description: 'Lectora de pie con pantalla de lino y una luz cálida, precisa y silenciosa.',
    priceMinorUnits: 26_500_000,
    stock: 3,
    sortOrder: 1,
    asset: assets[3]!,
    gallery: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000076',
    name: 'Lámpara Alba',
    description: 'Esfera de vidrio opalino sobre base mineral para mesas de noche y recibidores.',
    priceMinorUnits: 9_800_000,
    stock: 0,
    sortOrder: 2,
    asset: assets[4]!,
    gallery: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000077',
    name: 'Aplique Línea',
    description: 'Aplique vertical de luz indirecta para acompañar circulaciones y muros texturados.',
    priceMinorUnits: 7_450_000,
    stock: 8,
    sortOrder: 3,
    asset: assets[5]!,
    gallery: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000078',
    name: 'Perfil Norte',
    description: 'Perfil lineal arquitectónico para resolver iluminación general con una presencia mínima.',
    priceMinorUnits: 31_200_000,
    stock: 6,
    sortOrder: 4,
    asset: assets[6]!,
    gallery: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000079',
    name: 'Plafón Veta',
    description: 'Volumen mineral de luz indirecta para cielos rasos y espacios de transición.',
    priceMinorUnits: 14_600_000,
    stock: 10,
    sortOrder: 5,
    asset: assets[7]!,
    gallery: [],
  },
] as const;

const demoConfig = {
  schemaVersion: 1,
  title: 'Lumbre Norte',
  intro: 'Iluminación contemporánea para espacios con carácter.',
};

function quote(value: string | number | null) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function json(value: unknown) {
  return quote(JSON.stringify(value));
}

function assertLocalOnly() {
  const environmentValues = [process.env.ENVIRONMENT, process.env.CLOUDFLARE_ENV, process.env.NODE_ENV, process.env.WRANGLER_ENV]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  const dangerousArgument = process.argv.slice(2).some((argument) => /remote|production/i.test(argument));
  if (environmentValues.includes('production') || dangerousArgument) throw new Error('Refusing to prepare the catalog demo in production or against a remote environment.');
}

function runWrangler(args: string[], capture = false) {
  return execFileSync(process.execPath, [wranglerScript, '--env', 'development', ...args], {
    cwd: apiDirectory,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'ignore', 'inherit'],
  });
}

function queryRows<T>(sql: string) {
  const raw = runWrangler(['d1', 'execute', 'corsteno-db', '--local', '--command', sql, '--json'], true) as string;
  const payload = JSON.parse(raw) as Array<{ results?: T[] }>;
  return payload[0]?.results ?? [];
}

async function executeSql(sql: string) {
  const file = path.join(root, `.corsteno-demo-catalog-${process.pid}.sql`);
  await writeFile(file, sql, { encoding: 'utf8', flag: 'wx' });
  try {
    runWrangler(['d1', 'execute', 'corsteno-db', '--local', '--file', file]);
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

function assetUrl(asset: AssetDefinition) {
  return `${localApiOrigin}/assets/organizations/${demo.organizationId}/assets/${asset.id}.png`;
}

function storageKey(asset: AssetDefinition) {
  return `organizations/${demo.organizationId}/assets/${asset.id}.png`;
}

function assertAvailableIdentity(table: string, id: string, slug: string) {
  const rows = queryRows<{ id: string; slug: string }>(`SELECT id,slug FROM ${table} WHERE id=${quote(id)} OR slug=${quote(slug)}`);
  for (const row of rows) {
    if (row.id !== id || row.slug !== slug) throw new Error(`The demo ${table} identity is already used by another local record.`);
  }
}

async function uploadAssets() {
  const sizes = new Map<string, number>();
  for (const asset of assets) {
    const file = path.join(root, 'scripts', 'demo-assets', 'catalog', asset.filename);
    const details = await stat(file);
    sizes.set(asset.id, details.size);
    runWrangler(['r2', 'object', 'put', `${localBucket}/${storageKey(asset)}`, '--local', '--file', file, '--content-type', 'image/png', '--force']);
  }
  return sizes;
}

function productSql(product: typeof products[number], now: number) {
  const ctaUrl = `https://example.com/lumbre-norte/${product.id.slice(-4)}`;
  return `INSERT INTO catalog_products (id,organization_id,experience_id,name,description,price_minor_units,currency,stock,sort_order,visible,main_asset_url,cta_label,cta_url,created_at,updated_at) VALUES (${quote(product.id)},${quote(demo.organizationId)},${quote(demo.experienceId)},${quote(product.name)},${quote(product.description)},${product.priceMinorUnits},'ARS',${product.stock},${product.sortOrder},1,${quote(assetUrl(product.asset))},'Consultar disponibilidad',${quote(ctaUrl)},${now},${now});`;
}

function gallerySql(product: typeof products[number], imageOffset: number, now: number) {
  return product.gallery.map((asset, index) => `INSERT INTO catalog_product_images (id,organization_id,experience_id,product_id,asset_id,sort_order,created_at) VALUES (${quote(`00000000-0000-4000-8000-0000000001${String(imageOffset + index).padStart(2, '0')}`)},${quote(demo.organizationId)},${quote(demo.experienceId)},${quote(product.id)},${quote(asset.id)},${index},${now});`).join('\n');
}

function publishedProductSql(product: typeof products[number], publishedId: string, now: number) {
  return `INSERT INTO catalog_published_products (id,organization_id,experience_id,source_product_id,name,description,price_minor_units,currency,stock,sort_order,main_asset_url,cta_label,cta_url,published_at) VALUES (${quote(publishedId)},${quote(demo.organizationId)},${quote(demo.experienceId)},${quote(product.id)},${quote(product.name)},${quote(product.description)},${product.priceMinorUnits},'ARS',${product.stock},${product.sortOrder},${quote(assetUrl(product.asset))},'Consultar disponibilidad',${quote(`https://example.com/lumbre-norte/${product.id.slice(-4)}`)},${now});`;
}

function publishedGallerySql(product: typeof products[number], publishedId: string, imageOffset: number, now: number) {
  return product.gallery.map((asset, index) => `INSERT INTO catalog_published_product_images (id,organization_id,experience_id,published_product_id,source_image_id,asset_url,sort_order,published_at) VALUES (${quote(`00000000-0000-4000-8000-0000000002${String(imageOffset + index).padStart(2, '0')}`)},${quote(demo.organizationId)},${quote(demo.experienceId)},${quote(publishedId)},${quote(asset.id)},${quote(assetUrl(asset))},${index},${now});`).join('\n');
}

async function main() {
  assertLocalOnly();
  const resetRequested = process.argv.includes('--reset');
  assertAvailableIdentity('organizations', demo.organizationId, demo.organizationSlug);
  assertAvailableIdentity('projects', demo.projectId, 'lumbre-norte-demo');
  assertAvailableIdentity('applications', demo.applicationId, 'lumbre-norte-catalogo');
  assertAvailableIdentity('experiences', demo.experienceId, 'lumbre-norte-catalogo-publico');

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const config = json(demoConfig);
  const assetSizes = await uploadAssets();
  const sql: string[] = [
    'PRAGMA foreign_keys=ON;',
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${quote(demo.organizationId)},'Lumbre Norte',${quote(demo.organizationSlug)},'active',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,status='active',updated_at=excluded.updated_at;`,
    `INSERT INTO projects (id,organization_id,name,slug,status,description,created_at,updated_at) VALUES (${quote(demo.projectId)},${quote(demo.organizationId)},'Lumbre Norte · Demo comercial','lumbre-norte-demo','active','Espacio local para presentar un catálogo de iluminación.',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,status='active',description=excluded.description,updated_at=excluded.updated_at;`,
    `INSERT INTO applications (id,organization_id,project_id,name,slug,status,application_type,created_at,updated_at) VALUES (${quote(demo.applicationId)},${quote(demo.organizationId)},${quote(demo.projectId)},'Catálogo público · Lumbre Norte','lumbre-norte-catalogo','active','product-catalog',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,status='active',application_type='product-catalog',updated_at=excluded.updated_at;`,
    `INSERT INTO experiences (id,organization_id,name,slug,type,status,schema_version,draft_config,published_config,starts_at,ends_at,project_id,application_id,created_at,updated_at) VALUES (${quote(demo.experienceId)},${quote(demo.organizationId)},'Lumbre Norte · Colección de luz','lumbre-norte-catalogo-publico','product-catalog','published',1,${config},${config},NULL,NULL,${quote(demo.projectId)},${quote(demo.applicationId)},${quote(nowIso)},${quote(nowIso)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,type='product-catalog',status='published',schema_version=1,draft_config=excluded.draft_config,published_config=excluded.published_config,starts_at=NULL,ends_at=NULL,project_id=excluded.project_id,application_id=excluded.application_id,updated_at=excluded.updated_at;`,
    `DELETE FROM subscription_experiences WHERE experience_id=${quote(demo.experienceId)} AND organization_id=${quote(demo.organizationId)};`,
    `DELETE FROM experience_access_periods WHERE experience_id=${quote(demo.experienceId)} AND organization_id=${quote(demo.organizationId)};`,
    `DELETE FROM catalog_published_product_images WHERE experience_id=${quote(demo.experienceId)} AND organization_id=${quote(demo.organizationId)};`,
    `DELETE FROM catalog_published_products WHERE experience_id=${quote(demo.experienceId)} AND organization_id=${quote(demo.organizationId)};`,
    `DELETE FROM catalog_product_images WHERE experience_id=${quote(demo.experienceId)} AND organization_id=${quote(demo.organizationId)};`,
    `DELETE FROM catalog_products WHERE experience_id=${quote(demo.experienceId)} AND organization_id=${quote(demo.organizationId)};`,
    `DELETE FROM events WHERE application_id=${quote(demo.applicationId)} AND organization_id=${quote(demo.organizationId)};`,
    `DELETE FROM app_sessions WHERE application_id=${quote(demo.applicationId)} AND organization_id=${quote(demo.organizationId)};`,
    `DELETE FROM organization_activity WHERE organization_id=${quote(demo.organizationId)};`,
  ];

  const actor = `(SELECT id FROM users WHERE email_normalized='admin@admin.com' LIMIT 1)`;
  assets.forEach((asset) => {
    sql.push(`INSERT INTO organization_assets (id,organization_id,storage_key,original_filename,display_name,mime_type,byte_size,category,created_by,created_at,updated_at,archived_at) VALUES (${quote(asset.id)},${quote(demo.organizationId)},${quote(storageKey(asset))},${quote(asset.filename)},${quote(asset.displayName)},'image/png',${assetSizes.get(asset.id) ?? 0},'image',${actor},${now},${now},NULL) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,storage_key=excluded.storage_key,original_filename=excluded.original_filename,display_name=excluded.display_name,mime_type=excluded.mime_type,byte_size=excluded.byte_size,category='image',created_by=excluded.created_by,updated_at=excluded.updated_at,archived_at=NULL;`);
  });
  products.forEach((product) => sql.push(productSql(product, now)));
  products.forEach((product, index) => sql.push(gallerySql(product, index * 2, now)));
  const publishedIds = products.map((product, index) => ({ product, id: `00000000-0000-4000-8000-00000000008${String(index + 1)}` }));
  publishedIds.forEach(({ product, id }) => sql.push(publishedProductSql(product, id, now)));
  publishedIds.forEach(({ product, id }, index) => sql.push(publishedGallerySql(product, id, index * 2, now)));

  const activity = [
    ['experience.created', 'experience', demo.experienceId, { name: 'Lumbre Norte · Colección de luz', type: 'product-catalog' }],
    ...products.map((product) => ['catalog.product.created', 'catalog_product', product.id, { name: product.name, experienceName: 'Lumbre Norte · Colección de luz' }]),
    ['catalog.gallery.updated', 'catalog_product', products[0]!.id, { operation: 'added', name: products[0]!.name }],
    ['experience.published', 'experience', demo.experienceId, { name: 'Lumbre Norte · Colección de luz' }],
  ] as const;
  activity.forEach(([action, resourceType, resourceId, metadata], index) => {
    sql.push(`INSERT INTO organization_activity (id,organization_id,actor_user_id,action,resource_type,resource_id,metadata,created_at) VALUES (${quote(`00000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, '0')}`)},${quote(demo.organizationId)},${actor},${quote(action)},${quote(resourceType)},${quote(resourceId)},${json(metadata)},${now - (activity.length - index) * 60_000});`);
  });

  await executeSql(sql.join('\n'));

  const counts = queryRows<{ products: number; images: number }>(`SELECT (SELECT COUNT(*) FROM catalog_products WHERE experience_id=${quote(demo.experienceId)} AND organization_id=${quote(demo.organizationId)}) products,(SELECT COUNT(*) FROM catalog_product_images WHERE experience_id=${quote(demo.experienceId)} AND organization_id=${quote(demo.organizationId)}) images`);
  const result = counts[0] ?? { products: 0, images: 0 };
  console.log(`${resetRequested ? 'Reset and rebuilt' : 'Built'} local catalog demo for Lumbre Norte: ${result.products} products, ${result.images} gallery images.`);
  console.log(`Experience: ${demo.experienceId} · public slug: lumbre-norte-catalogo-publico`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
