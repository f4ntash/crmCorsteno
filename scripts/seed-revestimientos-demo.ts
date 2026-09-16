/**
 * Isolated seed for the Revestimientos product-catalog demo.
 * Local runs only need --local. Production writes additionally require
 * --remote --execute plus the canonical production and backup guards.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDirectory = path.join(root, 'apps', 'api');
const wranglerScript = path.join(apiDirectory, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const bucket = 'corsteno-experience-assets';
const apiOrigin = { local: 'http://localhost:8787', remote: 'https://api.corsteno.com' } as const;
const demo = {
  organizationId: '00000000-0000-4000-8000-000000000050',
  organizationSlug: 'revestimientos-demo',
  projectId: '00000000-0000-4000-8000-000000000051',
  applicationId: '00000000-0000-4000-8000-000000000052',
  experienceId: '00000000-0000-4000-8000-000000000053',
  channelId: '00000000-0000-4000-8000-000000000304',
  experienceChannelId: '00000000-0000-4000-8000-000000000314',
};

type SeedMode = 'local' | 'remote';
type Material = {
  id: string;
  assetId: string;
  pbr: { baseColorAssetId: string; normalAssetId: string; roughnessAssetId: string; directory: string };
  key: string;
  name: string;
  description: string;
  priceMinorUnits: number;
  stock: number;
  filename: string;
  metadata: Record<string, string | number | boolean | null>;
};

const products: Material[] = [
  { id: '00000000-0000-4000-8000-000000000111', assetId: '00000000-0000-4000-8000-000000000511', pbr: { baseColorAssetId: '00000000-0000-4000-8000-000000000611', normalAssetId: '00000000-0000-4000-8000-000000000612', roughnessAssetId: '00000000-0000-4000-8000-000000000613', directory: 'liston-roble-natural' }, key: 'liston-roble-natural', name: 'Listón Roble Natural', description: 'Listones cálidos de veta suave para sumar ritmo y profundidad al ambiente.', priceMinorUnits: 3_890_000, stock: 48, filename: 'liston-roble-natural.svg', metadata: { material: 'Madera', color: 'Roble natural', finish: 'Mate', format: 'Listón', width: 160, height: 2400, thickness: 12, recommendedUse: 'Pared', environment: 'Interior', surface: 'Pared' } },
  { id: '00000000-0000-4000-8000-000000000112', assetId: '00000000-0000-4000-8000-000000000512', pbr: { baseColorAssetId: '00000000-0000-4000-8000-000000000614', normalAssetId: '00000000-0000-4000-8000-000000000615', roughnessAssetId: '00000000-0000-4000-8000-000000000616', directory: 'panel-nordico-claro' }, key: 'panel-nordico-claro', name: 'Panel Nórdico Claro', description: 'Panel de líneas verticales y tono claro para espacios luminosos.', priceMinorUnits: 4_650_000, stock: 32, filename: 'panel-nordico-claro.svg', metadata: { material: 'Panel', color: 'Marfil', finish: 'Satinado', format: 'Panel', width: 180, height: 2800, thickness: 14, recommendedUse: 'Pared', environment: 'Interior', surface: 'Pared' } },
  { id: '00000000-0000-4000-8000-000000000113', assetId: '00000000-0000-4000-8000-000000000513', pbr: { baseColorAssetId: '00000000-0000-4000-8000-000000000617', normalAssetId: '00000000-0000-4000-8000-000000000618', roughnessAssetId: '00000000-0000-4000-8000-000000000619', directory: 'piedra-gris-andina' }, key: 'piedra-gris-andina', name: 'Piedra Gris Andina', description: 'Textura mineral de tonos grises para una superficie de presencia serena.', priceMinorUnits: 5_890_000, stock: 27, filename: 'piedra-gris-andina.svg', metadata: { material: 'Piedra', color: 'Gris andino', finish: 'Natural', format: 'Placa', width: 600, height: 1200, thickness: 18, recommendedUse: 'Pared / piso', environment: 'Interior / exterior', surface: 'Pared / piso' } },
  { id: '00000000-0000-4000-8000-000000000114', assetId: '00000000-0000-4000-8000-000000000514', pbr: { baseColorAssetId: '00000000-0000-4000-8000-000000000620', normalAssetId: '00000000-0000-4000-8000-000000000621', roughnessAssetId: '00000000-0000-4000-8000-000000000622', directory: 'marmol-blanco' }, key: 'marmol-blanco', name: 'Mármol Blanco', description: 'Fondo claro con vetas delicadas para una terminación luminosa.', priceMinorUnits: 7_200_000, stock: 18, filename: 'marmol-blanco.svg', metadata: { material: 'Mármol', color: 'Blanco', finish: 'Pulido', format: 'Placa', width: 600, height: 1200, thickness: 16, recommendedUse: 'Pared / piso', environment: 'Interior', surface: 'Pared / piso' } },
  { id: '00000000-0000-4000-8000-000000000115', assetId: '00000000-0000-4000-8000-000000000515', pbr: { baseColorAssetId: '00000000-0000-4000-8000-000000000623', normalAssetId: '00000000-0000-4000-8000-000000000624', roughnessAssetId: '00000000-0000-4000-8000-000000000625', directory: 'cemento-arena' }, key: 'cemento-arena', name: 'Cemento Arena', description: 'Acabado continuo en tono arena para una estética calma y contemporánea.', priceMinorUnits: 4_250_000, stock: 54, filename: 'cemento-arena.svg', metadata: { material: 'Cemento', color: 'Arena', finish: 'Texturado fino', format: 'Placa', width: 600, height: 1200, thickness: 10, recommendedUse: 'Pared / piso', environment: 'Interior / exterior', surface: 'Pared / piso' } },
  { id: '00000000-0000-4000-8000-000000000116', assetId: '00000000-0000-4000-8000-000000000516', pbr: { baseColorAssetId: '00000000-0000-4000-8000-000000000626', normalAssetId: '00000000-0000-4000-8000-000000000627', roughnessAssetId: '00000000-0000-4000-8000-000000000628', directory: 'revestimiento-negro-texturado' }, key: 'negro-texturado', name: 'Revestimiento Negro Texturado', description: 'Relieve lineal oscuro para crear un acento arquitectónico definido.', priceMinorUnits: 8_990_000, stock: 21, filename: 'negro-texturado.svg', metadata: { material: 'Cerámica', color: 'Negro grafito', finish: 'Texturado', format: 'Panel', width: 300, height: 900, thickness: 12, recommendedUse: 'Pared', environment: 'Interior', surface: 'Pared' } },
];

const pbrCalibration: Record<string, { width: number; height: number; rotation: number; roughness: number; normalScale: number }> = {
  'liston-roble-natural': { width: 0.16, height: 2.4, rotation: 90, roughness: 0.78, normalScale: 0.38 },
  'panel-nordico-claro': { width: 0.6, height: 0.6, rotation: 90, roughness: 0.78, normalScale: 0.24 },
  'piedra-gris-andina': { width: 2, height: 2, rotation: 0, roughness: 0.9, normalScale: 0.55 },
  'marmol-blanco': { width: 1.5, height: 1.5, rotation: 0, roughness: 0.28, normalScale: 0.22 },
  'cemento-arena': { width: 2.1, height: 2.1, rotation: 0, roughness: 0.92, normalScale: 0.18 },
  'negro-texturado': { width: 1.6, height: 1.6, rotation: 90, roughness: 0.82, normalScale: 0.32 },
};

function quote(value: string | number | null) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function json(value: unknown) {
  return quote(JSON.stringify(value));
}

function storageKey(product: Material) {
  return `organizations/${demo.organizationId}/assets/${product.assetId}.svg`;
}

function assetUrl(product: Material, mode: SeedMode) {
  return `${apiOrigin[mode]}/assets/organizations/${demo.organizationId}/assets/${product.assetId}.svg`;
}

function pbrStorageKey(product: Material, assetId: string) {
  return `organizations/${demo.organizationId}/assets/${assetId}.webp`;
}

function loadCanonicalEnvironment() {
  const file = path.join(root, '.env.canonical-production.local');
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

function modeFromArgs(): SeedMode {
  const local = process.argv.includes('--local');
  const remote = process.argv.includes('--remote');
  if (local === remote) throw new Error('Elegí exactamente un destino: --local o --remote.');
  return remote ? 'remote' : 'local';
}

function assertMode(mode: SeedMode) {
  const environmentValues = [process.env.ENVIRONMENT, process.env.CLOUDFLARE_ENV, process.env.NODE_ENV, process.env.WRANGLER_ENV]
    .filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase());
  if (mode === 'local') {
    if (environmentValues.includes('production') || process.argv.some((argument) => /remote|production/i.test(argument))) throw new Error('Bloqueado: --local solo puede modificar la D1 y R2 locales.');
    if (process.argv.includes('--execute')) throw new Error('No uses --execute con --local.');
    return;
  }
  loadCanonicalEnvironment();
  if (!process.argv.includes('--execute')) throw new Error('Bloqueado: para escribir remoto se necesita --execute explícito.');
  if (process.env.ENVIRONMENT !== 'production' || process.env.RESET_PRODUCTION_DATABASE !== 'corsteno-db' || process.env.CANONICAL_BACKUP_DATABASE !== 'corsteno-db') throw new Error('Bloqueado: faltan las guardas de producción de Corsteno.');
  const backup = process.env.CANONICAL_BACKUP_PATH;
  if (!backup || !existsSync(backup) || statSync(backup).size <= 0) throw new Error('Bloqueado: CANONICAL_BACKUP_PATH debe apuntar a un backup no vacío.');
}

function runWrangler(mode: SeedMode, args: string[], capture = false) {
  const environmentArgs = mode === 'local' ? ['--env', 'development'] : [];
  return execFileSync(process.execPath, [wranglerScript, ...environmentArgs, ...args], {
    cwd: apiDirectory,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'ignore', 'inherit'],
  });
}

function queryRows<T>(mode: SeedMode, sql: string) {
  const raw = runWrangler(mode, ['d1', 'execute', 'corsteno-db', mode === 'local' ? '--local' : '--remote', '--command', sql, '--json'], true) as string;
  const payload = JSON.parse(raw) as Array<{ results?: T[] }>;
  return payload[0]?.results ?? [];
}

function assertAvailableIdentity(mode: SeedMode, table: string, id: string, slug: string) {
  const rows = queryRows<{ id: string; slug: string }>(mode, `SELECT id,slug FROM ${table} WHERE id=${quote(id)} OR slug=${quote(slug)}`);
  for (const row of rows) if (row.id !== id || row.slug !== slug) throw new Error(`La identidad ${table}/${slug} ya pertenece a otro registro.`);
}

function assertSchema(mode: SeedMode) {
  const columns = queryRows<{ name: string }>(mode, 'PRAGMA table_info(products)');
  if (!columns.some((column) => column.name === 'price_unit') || !columns.some((column) => column.name === 'metadata')) throw new Error('Aplicá las migraciones locales antes de preparar el demo: pnpm --filter @corsteno/api db:migrate:local.');
}

async function uploadAssets(mode: SeedMode) {
  const sizes = new Map<string, number>();
  for (const product of products) {
    const file = path.join(root, 'scripts', 'canonical-assets', 'revestimientos', product.filename);
    const details = await stat(file);
    sizes.set(product.assetId, details.size);
    runWrangler(mode, ['r2', 'object', 'put', `${bucket}/${storageKey(product)}`, ...(mode === 'local' ? ['--local'] : ['--remote']), '--file', file, '--content-type', 'image/svg+xml', '--force']);
    for (const [role, assetId] of [['basecolor', product.pbr.baseColorAssetId], ['normal', product.pbr.normalAssetId], ['roughness', product.pbr.roughnessAssetId] as const]) {
      const pbrFile = path.join(root, 'apps', 'runtime', 'public', 'materials', 'revestimientos', product.pbr.directory, `${role}.webp`);
      const pbrDetails = await stat(pbrFile);
      sizes.set(assetId, pbrDetails.size);
      runWrangler(mode, ['r2', 'object', 'put', `${bucket}/${pbrStorageKey(product, assetId)}`, ...(mode === 'local' ? ['--local'] : ['--remote']), '--file', pbrFile, '--content-type', 'image/webp', '--force']);
    }
  }
  return sizes;
}

function seedSql(mode: SeedMode, assetSizes: Map<string, number>) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const config = { schemaVersion: 1, title: 'Revestimientos', intro: 'Materiales y texturas para transformar cada ambiente.' };
  const sql = [
    'PRAGMA foreign_keys=ON;',
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${quote(demo.organizationId)},'Revestimientos Demo',${quote(demo.organizationSlug)},'active',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,status='active',updated_at=excluded.updated_at;`,
    `INSERT INTO projects (id,organization_id,name,slug,status,description,created_at,updated_at) VALUES (${quote(demo.projectId)},${quote(demo.organizationId)},'Revestimientos · Demo comercial','revestimientos-demo','active','Catálogo de superficies y revestimientos.',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,status='active',description=excluded.description,updated_at=excluded.updated_at;`,
    `INSERT INTO applications (id,organization_id,project_id,name,slug,status,application_type,created_at,updated_at) VALUES (${quote(demo.applicationId)},${quote(demo.organizationId)},${quote(demo.projectId)},'Revestimientos','revestimientos-demo-catalogo','active','product-catalog',${now},${now}) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,name=excluded.name,slug=excluded.slug,status='active',application_type='product-catalog',updated_at=excluded.updated_at;`,
    `INSERT INTO experiences (id,organization_id,name,slug,type,status,schema_version,draft_config,published_config,starts_at,ends_at,project_id,application_id,created_at,updated_at) VALUES (${quote(demo.experienceId)},${quote(demo.organizationId)},'Revestimientos','revestimientos-demo-catalogo','product-catalog','published',1,${json(config)},${json(config)},NULL,NULL,${quote(demo.projectId)},${quote(demo.applicationId)},${quote(nowIso)},${quote(nowIso)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,type='product-catalog',status='published',schema_version=1,draft_config=excluded.draft_config,published_config=excluded.published_config,starts_at=NULL,ends_at=NULL,project_id=excluded.project_id,application_id=excluded.application_id,updated_at=excluded.updated_at;`,
    `INSERT INTO channels (id,organization_id,name,type,status,url,created_at,updated_at) VALUES (${quote(demo.channelId)},${quote(demo.organizationId)},'Canal público','hosted_runtime','active',NULL,${now},${now}) ON CONFLICT(id) DO UPDATE SET status='active',updated_at=excluded.updated_at;`,
    `INSERT OR IGNORE INTO experience_channels (id,organization_id,experience_id,channel_id,created_at) VALUES (${quote(demo.experienceChannelId)},${quote(demo.organizationId)},${quote(demo.experienceId)},${quote(demo.channelId)},${now});`,
    `INSERT OR IGNORE INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) SELECT '00000000-0000-4000-8000-000000000521',u.id,${quote(demo.organizationId)},'owner','active',${now},${now} FROM users u WHERE u.email_normalized IN ('admin@corsteno.com','admin@admin.com') ORDER BY CASE u.email_normalized WHEN 'admin@corsteno.com' THEN 0 ELSE 1 END LIMIT 1;`,
  ];

  for (const product of products) {
    const image = assetUrl(product, mode);
    const ctaUrl = `https://wa.me/5493515550199?text=${encodeURIComponent(`Hola, quiero consultar por ${product.name}.`)}`;
    const published = {
      name: product.name,
      description: product.description,
      priceMinorUnits: product.priceMinorUnits,
      currency: 'ARS',
      priceUnit: 'm²',
      metadata: product.metadata,
      stock: product.stock,
      mainAssetUrl: image,
      ctaLabel: 'Consultar',
      ctaUrl,
      gallery: [],
    };
    const metadata = json(product.metadata);
    const calibration = pbrCalibration[product.key] ?? { width: 0.6, height: 0.6, rotation: 0, roughness: 0.7, normalScale: 0.45 };
    const pbrConfig = {
      schemaVersion: 1,
      enabled: true,
      mode: 'texture' as const,
      physicalWidthM: calibration.width,
      physicalHeightM: calibration.height,
      rotationDegrees: calibration.rotation,
      orientation: calibration.width > calibration.height ? 'horizontal' as const : 'vertical' as const,
      compatibleSurfaces: product.metadata.surface?.toString().toLowerCase().includes('piso') ? ['wall', 'floor'] as const : ['wall'] as const,
      roughness: calibration.roughness,
      metalness: 0,
      normalScale: calibration.normalScale,
      fallbackColor: '#d7d1c6',
      assets: { baseColorAssetId: product.pbr.baseColorAssetId, normalAssetId: product.pbr.normalAssetId, roughnessAssetId: product.pbr.roughnessAssetId },
    };
    sql.push(
      `INSERT INTO organization_assets (id,organization_id,storage_key,original_filename,display_name,mime_type,byte_size,category,created_by,created_at,updated_at,archived_at) VALUES (${quote(product.assetId)},${quote(demo.organizationId)},${quote(storageKey(product))},${quote(product.filename)},${quote(product.name)},'image/svg+xml',${assetSizes.get(product.assetId) ?? 0},'image',NULL,${now},${now},NULL) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,storage_key=excluded.storage_key,original_filename=excluded.original_filename,display_name=excluded.display_name,mime_type=excluded.mime_type,byte_size=excluded.byte_size,category='image',updated_at=excluded.updated_at,archived_at=NULL;`,
      ...([['basecolor', product.pbr.baseColorAssetId], ['normal', product.pbr.normalAssetId], ['roughness', product.pbr.roughnessAssetId] as const].map(([role, assetId]) => `INSERT INTO organization_assets (id,organization_id,storage_key,original_filename,display_name,mime_type,byte_size,category,created_by,created_at,updated_at,archived_at) VALUES (${quote(assetId)},${quote(demo.organizationId)},${quote(pbrStorageKey(product, assetId))},${quote(`${product.key}-${role}.webp`)},${quote(`${product.name} · ${role}`)},'image/webp',${assetSizes.get(assetId) ?? 0},'surface-material-map',NULL,${now},${now},NULL) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,storage_key=excluded.storage_key,original_filename=excluded.original_filename,display_name=excluded.display_name,mime_type='image/webp',byte_size=excluded.byte_size,category='surface-material-map',updated_at=excluded.updated_at,archived_at=NULL;`)),
      `INSERT INTO products (id,organization_id,product_key,name,description,price_minor_units,currency,price_unit,metadata,stock,main_asset_url,cta_label,cta_url,status,published_content,published_at,created_at,updated_at,archived_at) VALUES (${quote(product.id)},${quote(demo.organizationId)},${quote(product.key)},${quote(product.name)},${quote(product.description)},${product.priceMinorUnits},'ARS','m²',${metadata},${product.stock},${quote(image)},'Consultar',${quote(ctaUrl)},'active',${json(published)},${now},${now},${now},NULL) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,product_key=excluded.product_key,name=excluded.name,description=excluded.description,price_minor_units=excluded.price_minor_units,currency=excluded.currency,price_unit=excluded.price_unit,metadata=excluded.metadata,stock=excluded.stock,main_asset_url=excluded.main_asset_url,cta_label=excluded.cta_label,cta_url=excluded.cta_url,status='active',published_content=excluded.published_content,published_at=excluded.published_at,updated_at=excluded.updated_at,archived_at=NULL;`,
      `INSERT INTO product_surface_config (product_id,organization_id,draft_config,published_config,draft_version,published_version,created_at,updated_at,published_at) VALUES (${quote(product.id)},${quote(demo.organizationId)},${json(pbrConfig)},${json(pbrConfig)},1,1,${now},${now},${now}) ON CONFLICT(product_id) DO UPDATE SET organization_id=excluded.organization_id,draft_config=excluded.draft_config,published_config=excluded.published_config,draft_version=1,published_version=1,updated_at=excluded.updated_at,published_at=excluded.published_at;`,
    );
    const index = products.indexOf(product);
    const associationId = `00000000-0000-4000-8000-${String(421 + index).padStart(12, '0')}`;
    const publishedAssociationId = `00000000-0000-4000-8000-${String(431 + index).padStart(12, '0')}`;
    sql.push(
      `INSERT INTO catalog_experience_products (id,organization_id,experience_id,product_id,sort_order,visible,created_at,updated_at) VALUES (${quote(associationId)},${quote(demo.organizationId)},${quote(demo.experienceId)},${quote(product.id)},${index},1,${now},${now}) ON CONFLICT(experience_id,product_id) DO UPDATE SET sort_order=excluded.sort_order,visible=1,updated_at=excluded.updated_at;`,
      `INSERT INTO catalog_published_experience_products (id,organization_id,experience_id,product_id,sort_order,visible,published_at) VALUES (${quote(publishedAssociationId)},${quote(demo.organizationId)},${quote(demo.experienceId)},${quote(product.id)},${index},1,${now}) ON CONFLICT(experience_id,product_id) DO UPDATE SET sort_order=excluded.sort_order,visible=1,published_at=excluded.published_at;`,
    );
  }
  return sql.join('\n');
}

async function executeSql(mode: SeedMode, sql: string) {
  const file = path.join(root, `.corsteno-revestimientos-${process.pid}.sql`);
  await writeFile(file, sql, { encoding: 'utf8', flag: 'wx' });
  try {
    runWrangler(mode, ['d1', 'execute', 'corsteno-db', mode === 'local' ? '--local' : '--remote', '--file', file]);
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

async function main() {
  const mode = modeFromArgs();
  assertMode(mode);
  for (const [table, id, slug] of [
    ['organizations', demo.organizationId, demo.organizationSlug],
    ['projects', demo.projectId, 'revestimientos-demo'],
    ['applications', demo.applicationId, 'revestimientos-demo-catalogo'],
    ['experiences', demo.experienceId, 'revestimientos-demo-catalogo'],
  ] as const) assertAvailableIdentity(mode, table, id, slug);
  assertSchema(mode);
  const assetSizes = await uploadAssets(mode);
  await executeSql(mode, seedSql(mode, assetSizes));
  const result = queryRows<{ products: number; assets: number }>(mode, `SELECT (SELECT COUNT(*) FROM catalog_published_experience_products WHERE organization_id=${quote(demo.organizationId)} AND experience_id=${quote(demo.experienceId)} AND visible=1) products,(SELECT COUNT(*) FROM organization_assets WHERE organization_id=${quote(demo.organizationId)} AND archived_at IS NULL) assets`)[0] ?? { products: 0, assets: 0 };
  console.log(`${mode === 'local' ? 'Prepared local' : 'Seeded isolated production'} Revestimientos demo: ${result.products} published products, ${result.assets} assets.`);
  console.log(`Experience: ${demo.experienceId} · slug: revestimientos-demo-catalogo`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
