/**
 * Prepares the La Estación workspace and seeds synthetic analytics through
 * the public application-credential ingestion contract.
 *
 * The database cleanup is deliberately scoped to one application and one
 * marker property. Real future events do not carry that marker and remain
 * untouched. Local is the default operational target; remote writes require
 * explicit production guards and are never run as part of this repository
 * change.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_EVENT_NAMES } from '@corsteno/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDirectory = path.join(root, 'apps', 'api');
const wranglerScript = path.join(apiDirectory, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const localApiUrl = 'http://127.0.0.1:8787';
const remoteApiUrl = 'https://api.corsteno.com';
const argentinaUtcOffsetMs = 3 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const demoSeed = 'la-estacion-demo-v1';

export const LA_ESTACION_DEMO = {
  organizationId: '00000000-0000-4000-8000-000000000080',
  organizationSlug: 'la-estacion',
  projectId: '00000000-0000-4000-8000-000000000081',
  projectSlug: 'tus-estaciones',
  applicationId: '00000000-0000-4000-8000-000000000082',
  applicationSlug: 'tus-estaciones',
  experienceId: '00000000-0000-4000-8000-000000000083',
  experienceSlug: 'tus-estaciones',
} as const;

export const LA_ESTACION_DEMO_COUNTS = {
  uniqueUsers: 450,
  sessions: 620,
  app_opened: 760,
  session_started: 620,
  session_ended: 590,
  experience_started: 310,
  experience_finished: 248,
  image_target_detected: 225,
  camera_permission_granted: 185,
  camera_permission_denied: 28,
  photo_studio_opened: 140,
  photo_captured: 95,
  photo_shared: 58,
  passport_opened: 170,
  station_opened: 260,
} as const;

type Mode = 'local' | 'remote';
type SeedEvent = {
  event: string;
  userId: string;
  sessionId: string;
  occurredAt: number;
  properties: Record<string, unknown>;
};
type CountRow = { name: string; value: number };
type Verification = { eventCount: number; uniqueUsers: number; sessions: number; byEvent: CountRow[]; byAction: CountRow[] };

const stationCatalog = [
  { id: 'estacion-centro', name: 'Estación Centro' },
  { id: 'estacion-rio', name: 'Estación Río' },
  { id: 'estacion-parque', name: 'Estación Parque' },
  { id: 'estacion-norte', name: 'Estación Norte' },
  { id: 'estacion-sur', name: 'Estación Sur' },
  { id: 'estacion-puerto', name: 'Estación Puerto' },
] as const;

const expectedEventCounts: Record<string, number> = {
  app_opened: LA_ESTACION_DEMO_COUNTS.app_opened,
  session_started: LA_ESTACION_DEMO_COUNTS.session_started,
  session_ended: LA_ESTACION_DEMO_COUNTS.session_ended,
  experience_started: LA_ESTACION_DEMO_COUNTS.experience_started,
  experience_finished: LA_ESTACION_DEMO_COUNTS.experience_finished,
  image_target_detected: LA_ESTACION_DEMO_COUNTS.image_target_detected,
  camera_permission_granted: LA_ESTACION_DEMO_COUNTS.camera_permission_granted,
  camera_permission_denied: LA_ESTACION_DEMO_COUNTS.camera_permission_denied,
  button_clicked: LA_ESTACION_DEMO_COUNTS.photo_studio_opened
    + LA_ESTACION_DEMO_COUNTS.photo_captured
    + LA_ESTACION_DEMO_COUNTS.photo_shared
    + LA_ESTACION_DEMO_COUNTS.passport_opened
    + LA_ESTACION_DEMO_COUNTS.station_opened,
};

const expectedActionCounts: Record<string, number> = {
  photo_studio_opened: LA_ESTACION_DEMO_COUNTS.photo_studio_opened,
  photo_captured: LA_ESTACION_DEMO_COUNTS.photo_captured,
  photo_shared: LA_ESTACION_DEMO_COUNTS.photo_shared,
  passport_opened: LA_ESTACION_DEMO_COUNTS.passport_opened,
  station_opened: LA_ESTACION_DEMO_COUNTS.station_opened,
};

function quote(value: string | number | null) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function json(value: unknown) {
  return quote(JSON.stringify(value));
}

function modeFromArgs(): Mode {
  const local = process.argv.includes('--local');
  const remote = process.argv.includes('--remote');
  if (local && remote) throw new Error('No combines --local y --remote.');
  return remote ? 'remote' : 'local';
}

function loadProductionEnvironment() {
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

function assertMode(mode: Mode) {
  const values = [process.env.ENVIRONMENT, process.env.CLOUDFLARE_ENV, process.env.NODE_ENV, process.env.WRANGLER_ENV]
    .filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase());
  if (mode === 'local') {
    if (values.includes('production') || process.argv.includes('--confirm-remote')) throw new Error('Bloqueado: --local no puede ejecutarse en production ni con guardas remotas.');
    return;
  }
  loadProductionEnvironment();
  if (!process.argv.includes('--execute') || !process.argv.includes('--confirm-remote')) throw new Error('Bloqueado: un seed remoto requiere --execute --confirm-remote.');
  if (
    process.env.ENVIRONMENT !== 'production'
    || process.env.RESET_PRODUCTION_DATABASE !== 'corsteno-db'
    || process.env.ALLOW_LA_ESTACION_REMOTE !== 'true'
  ) {
    throw new Error('Bloqueado: un seed remoto requiere ENVIRONMENT=production, RESET_PRODUCTION_DATABASE=corsteno-db y ALLOW_LA_ESTACION_REMOTE=true.');
  }
}

function runWrangler(mode: Mode, args: string[], capture = false) {
  const environmentArgs = mode === 'local' ? ['--env', 'development'] : [];
  return execFileSync(process.execPath, [wranglerScript, ...environmentArgs, ...args], {
    cwd: apiDirectory,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'ignore', 'inherit'],
  });
}

function queryRows<T>(mode: Mode, sql: string): T[] {
  const raw = runWrangler(mode, ['d1', 'execute', 'corsteno-db', mode === 'local' ? '--local' : '--remote', '--command', sql, '--json'], true) as string;
  const payload = JSON.parse(raw) as Array<{ results?: T[] }>;
  return payload[0]?.results ?? [];
}

async function executeSql(mode: Mode, sql: string) {
  const file = path.join(root, `.corsteno-la-estacion-${process.pid}.sql`);
  await writeFile(file, sql, { encoding: 'utf8', flag: 'wx' });
  try {
    runWrangler(mode, ['d1', 'execute', 'corsteno-db', mode === 'local' ? '--local' : '--remote', '--file', file]);
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

function assertAvailableIdentity(mode: Mode, table: string, id: string, slug: string) {
  const rows = queryRows<{ id: string; slug: string }>(mode, `SELECT id,slug FROM ${table} WHERE id=${quote(id)} OR slug=${quote(slug)}`);
  for (const row of rows) if (row.id !== id || row.slug !== slug) throw new Error(`La identidad ${table}/${slug} ya pertenece a otro registro.`);
}

function assertSchema(mode: Mode) {
  const events = queryRows<{ name: string }>(mode, 'PRAGMA table_info(events)');
  const experiences = queryRows<{ name: string }>(mode, 'PRAGMA table_info(experiences)');
  const requiredEventColumns = ['organization_id', 'project_id', 'application_id', 'event_name', 'properties', 'occurred_at'];
  const requiredExperienceColumns = ['project_id', 'application_id'];
  if (!requiredEventColumns.every((column) => events.some((item) => item.name === column)) || !requiredExperienceColumns.every((column) => experiences.some((item) => item.name === column))) {
    throw new Error('Aplicá las migraciones locales antes de preparar el demo: pnpm --filter @corsteno/api db:migrate:local.');
  }
}

function provisionSql() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  return [
    'PRAGMA foreign_keys=ON;',
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${quote(LA_ESTACION_DEMO.organizationId)},'La Estación',${quote(LA_ESTACION_DEMO.organizationSlug)},'active',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,status='active',updated_at=excluded.updated_at;`,
    `INSERT INTO projects (id,organization_id,name,slug,status,description,created_at,updated_at) VALUES (${quote(LA_ESTACION_DEMO.projectId)},${quote(LA_ESTACION_DEMO.organizationId)},'TUS ESTACIONES',${quote(LA_ESTACION_DEMO.projectSlug)},'active','Proyecto demo comercial de la experiencia TUS ESTACIONES.',${now},${now}) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,name=excluded.name,slug=excluded.slug,status='active',description=excluded.description,updated_at=excluded.updated_at;`,
    `INSERT INTO applications (id,organization_id,project_id,name,slug,status,application_type,created_at,updated_at) VALUES (${quote(LA_ESTACION_DEMO.applicationId)},${quote(LA_ESTACION_DEMO.organizationId)},${quote(LA_ESTACION_DEMO.projectId)},'TUS ESTACIONES',${quote(LA_ESTACION_DEMO.applicationSlug)},'active','generic',${now},${now}) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,project_id=excluded.project_id,name=excluded.name,slug=excluded.slug,status='active',application_type='generic',updated_at=excluded.updated_at;`,
    `INSERT INTO experiences (id,organization_id,name,slug,type,status,schema_version,draft_config,published_config,starts_at,ends_at,project_id,application_id,created_at,updated_at) VALUES (${quote(LA_ESTACION_DEMO.experienceId)},${quote(LA_ESTACION_DEMO.organizationId)},'TUS ESTACIONES',${quote(LA_ESTACION_DEMO.experienceSlug)},'ar','published',1,${json({ schemaVersion: 1, external: true })},${json({ schemaVersion: 1, external: true })},NULL,NULL,${quote(LA_ESTACION_DEMO.projectId)},${quote(LA_ESTACION_DEMO.applicationId)},${quote(nowIso)},${quote(nowIso)}) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,name=excluded.name,slug=excluded.slug,type='ar',status='published',schema_version=1,draft_config=excluded.draft_config,published_config=excluded.published_config,starts_at=NULL,ends_at=NULL,project_id=excluded.project_id,application_id=excluded.application_id,updated_at=excluded.updated_at;`,
  ].join('\n');
}

function deleteDemoEventsSql() {
  return `DELETE FROM events WHERE application_id=${quote(LA_ESTACION_DEMO.applicationId)} AND json_extract(properties,'$.demoSeed')=${quote(demoSeed)};`;
}

function deterministicRandom(seed: number) {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

function weightedDay(seed: number) {
  const weights = [1.2, 1.15, 1.1, 1, 0.95, 0.9, 0.8];
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = deterministicRandom(seed) * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index]!;
    if (cursor <= 0) return index;
  }
  return weights.length - 1;
}

function activityHour(seed: number) {
  const night = [20, 21, 22, 23, 0, 1, 2, 3];
  if (deterministicRandom(seed + 17) < 0.68) return night[Math.floor(deterministicRandom(seed + 31) * night.length)]!;
  return Math.floor(deterministicRandom(seed + 47) * 20) + 4;
}

function localTimestamp(now: number, seed: number) {
  const localNow = new Date(now - argentinaUtcOffsetMs);
  const localDayStart = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) + argentinaUtcOffsetMs;
  const day = weightedDay(seed);
  const hour = activityHour(seed);
  const minute = Math.floor(deterministicRandom(seed + 61) * 60);
  let timestamp = localDayStart - day * dayMs + hour * 60 * 60 * 1000 + minute * 60 * 1000;
  const latest = now - 20 * 60 * 1000;
  if (timestamp > latest) timestamp -= dayMs;
  return Math.min(latest, Math.max(now - 7 * dayMs + 5 * 60 * 1000, timestamp));
}

function baseProperties(properties: Record<string, unknown> = {}) {
  return { demo: true, demoSeed, source: 'seed-la-estacion-demo', ...properties };
}

function generateEvents(now = Date.now()): SeedEvent[] {
  const users = Array.from({ length: LA_ESTACION_DEMO_COUNTS.uniqueUsers }, (_, index) => `la-estacion-demo-user-${String(index + 1).padStart(3, '0')}`);
  const sessions = Array.from({ length: LA_ESTACION_DEMO_COUNTS.sessions }, (_, index) => ({
    id: `la-estacion-demo-session-${String(index + 1).padStart(3, '0')}`,
    userId: users[index < users.length ? index : Math.floor(deterministicRandom(index + 101) * users.length)]!,
    startedAt: localTimestamp(now, index + 1000),
  }));
  const events: SeedEvent[] = [];
  const add = (event: string, index: number, properties: Record<string, unknown>, sessionIndex = index, offsetMs = 0) => {
    if (!(KNOWN_EVENT_NAMES as readonly string[]).includes(event)) throw new Error(`Evento no permitido por KNOWN_EVENT_NAMES: ${event}`);
    const session = sessions[sessionIndex % sessions.length]!;
    const occurredAt = Math.min(now - 5 * 60 * 1000, Math.max(now - 7 * dayMs + 5 * 60 * 1000, session.startedAt + offsetMs));
    events.push({ event, userId: session.userId, sessionId: session.id, occurredAt, properties: baseProperties(properties) });
  };

  for (let index = 0; index < LA_ESTACION_DEMO_COUNTS.sessions; index += 1) add('session_started', index, { surface: 'public_experience' }, index);
  for (let index = 0; index < LA_ESTACION_DEMO_COUNTS.session_ended; index += 1) add('session_ended', index, { surface: 'public_experience' }, index, 13 * 60 * 1000);
  for (let index = 0; index < LA_ESTACION_DEMO_COUNTS.app_opened; index += 1) add('app_opened', index, { surface: 'public_experience' }, index % sessions.length, 30 * 1000 + (index % 7) * 11 * 1000);
  for (let index = 0; index < LA_ESTACION_DEMO_COUNTS.experience_started; index += 1) add('experience_started', index, { experience: LA_ESTACION_DEMO.experienceSlug }, index * 2, 2 * 60 * 1000);
  for (let index = 0; index < LA_ESTACION_DEMO_COUNTS.experience_finished; index += 1) add('experience_finished', index, { experience: LA_ESTACION_DEMO.experienceSlug }, index * 2, 18 * 60 * 1000);
  for (let index = 0; index < LA_ESTACION_DEMO_COUNTS.image_target_detected; index += 1) {
    const station = stationCatalog[index % stationCatalog.length]!;
    add('image_target_detected', index, { stationId: station.id, stationName: station.name }, index * 3, 4 * 60 * 1000);
  }
  for (let index = 0; index < LA_ESTACION_DEMO_COUNTS.camera_permission_granted; index += 1) add('camera_permission_granted', index, { permission: 'camera' }, index * 3, 3 * 60 * 1000);
  for (let index = 0; index < LA_ESTACION_DEMO_COUNTS.camera_permission_denied; index += 1) add('camera_permission_denied', index, { permission: 'camera' }, index * 5, 3 * 60 * 1000);

  const actions: Array<[string, number]> = [
    ['photo_studio_opened', LA_ESTACION_DEMO_COUNTS.photo_studio_opened],
    ['photo_captured', LA_ESTACION_DEMO_COUNTS.photo_captured],
    ['photo_shared', LA_ESTACION_DEMO_COUNTS.photo_shared],
    ['passport_opened', LA_ESTACION_DEMO_COUNTS.passport_opened],
    ['station_opened', LA_ESTACION_DEMO_COUNTS.station_opened],
  ];
  let actionIndex = 0;
  for (const [action, count] of actions) {
    for (let index = 0; index < count; index += 1) {
      add('button_clicked', actionIndex, { action }, actionIndex * 2, 6 * 60 * 1000 + (actionIndex % 5) * 17 * 1000);
      actionIndex += 1;
    }
  }
  return events.sort((left, right) => left.occurredAt - right.occurredAt || left.event.localeCompare(right.event));
}

function expectedTotal() {
  return Object.values(expectedEventCounts).reduce((sum, value) => sum + value, 0);
}

function verify(mode: Mode): Verification {
  const applicationId = quote(LA_ESTACION_DEMO.applicationId);
  const marker = quote(demoSeed);
  const summary = queryRows<{ eventCount: number; uniqueUsers: number; sessions: number }>(mode, `SELECT COUNT(*) eventCount,COUNT(DISTINCT anonymous_user_id) uniqueUsers,COUNT(DISTINCT session_id) sessions FROM events WHERE application_id=${applicationId} AND json_extract(properties,'$.demoSeed')=${marker}`)[0] ?? { eventCount: 0, uniqueUsers: 0, sessions: 0 };
  const byEvent = queryRows<CountRow>(mode, `SELECT event_name name,COUNT(*) value FROM events WHERE application_id=${applicationId} AND json_extract(properties,'$.demoSeed')=${marker} GROUP BY event_name ORDER BY event_name`);
  const byAction = queryRows<CountRow>(mode, `SELECT json_extract(properties,'$.action') name,COUNT(*) value FROM events WHERE application_id=${applicationId} AND json_extract(properties,'$.demoSeed')=${marker} AND json_extract(properties,'$.action') IS NOT NULL GROUP BY name ORDER BY name`);
  return { ...summary, byEvent, byAction };
}

function assertVerification(result: Verification) {
  if (result.eventCount !== expectedTotal() || result.uniqueUsers !== LA_ESTACION_DEMO_COUNTS.uniqueUsers || result.sessions !== LA_ESTACION_DEMO_COUNTS.sessions) throw new Error(`Verificación incompleta: ${JSON.stringify(result)}`);
  const actual = new Map(result.byEvent.map((row) => [row.name, Number(row.value)]));
  for (const [event, count] of Object.entries(expectedEventCounts)) if (actual.get(event) !== count) throw new Error(`Verificación incompleta para ${event}: esperado ${count}, obtenido ${actual.get(event) ?? 0}.`);
  const actualActions = new Map(result.byAction.map((row) => [row.name, Number(row.value)]));
  for (const [action, count] of Object.entries(expectedActionCounts)) if (actualActions.get(action) !== count) throw new Error(`Verificación incompleta para action=${action}: esperado ${count}, obtenido ${actualActions.get(action) ?? 0}.`);
}

async function seedEvents(apiUrl: string, secret: string, events: SeedEvent[]) {
  for (let index = 0; index < events.length; index += 50) {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/events/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ events: events.slice(index, index + 50) }),
    });
    if (!response.ok) throw new Error(`La API rechazó el batch ${Math.floor(index / 50) + 1}: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const mode = modeFromArgs();
  const actions = ['--prepare', '--reset', '--verify'].filter((flag) => process.argv.includes(flag));
  if (actions.length > 1) throw new Error('Elegí una sola acción entre --prepare, --reset y --verify.');
  assertMode(mode);
  for (const [table, id, slug] of [
    ['organizations', LA_ESTACION_DEMO.organizationId, LA_ESTACION_DEMO.organizationSlug],
    ['projects', LA_ESTACION_DEMO.projectId, LA_ESTACION_DEMO.projectSlug],
    ['applications', LA_ESTACION_DEMO.applicationId, LA_ESTACION_DEMO.applicationSlug],
    ['experiences', LA_ESTACION_DEMO.experienceId, LA_ESTACION_DEMO.experienceSlug],
  ] as const) assertAvailableIdentity(mode, table, id, slug);
  assertSchema(mode);

  if (actions[0] === '--verify') {
    const result = verify(mode);
    console.log(JSON.stringify(result, null, 2));
    assertVerification(result);
    console.log(`OK: ${result.eventCount} eventos demo, ${result.uniqueUsers} usuarios y ${result.sessions} sesiones.`);
    return;
  }
  const secret = actions[0] === '--reset' ? undefined : process.env.CORSTENO_ANALYTICS_APPLICATION_SECRET?.trim();
  if (actions.length === 0 && !secret) throw new Error('Falta CORSTENO_ANALYTICS_APPLICATION_SECRET. Prepará el workspace, creá la credential y exportá el secret antes de ejecutar el seed.');
  await executeSql(mode, provisionSql());
  if (actions[0] === '--prepare') {
    console.log(`Workspace preparado en D1 ${mode}: La Estación / TUS ESTACIONES / TUS ESTACIONES.`);
    console.log(`Application ID: ${LA_ESTACION_DEMO.applicationId}`);
    console.log('Siguiente paso: crear una application credential y cargar CORSTENO_ANALYTICS_APPLICATION_SECRET.');
    return;
  }
  await executeSql(mode, deleteDemoEventsSql());
  if (actions[0] === '--reset') {
    console.log(`Reset completo: se eliminaron únicamente los eventos con demoSeed=${demoSeed} de ${LA_ESTACION_DEMO.applicationId}.`);
    return;
  }
  const seedSecret = secret;
  if (!seedSecret) throw new Error('Falta CORSTENO_ANALYTICS_APPLICATION_SECRET.');
  const events = generateEvents();
  await seedEvents(process.env.API_URL?.trim() || (mode === 'local' ? localApiUrl : remoteApiUrl), seedSecret, events);
  const result = verify(mode);
  assertVerification(result);
  console.log(`Seed listo en D1 ${mode}: ${result.eventCount} eventos, ${result.uniqueUsers} usuarios y ${result.sessions} sesiones.`);
  console.log(`Conteo esperado por evento: ${JSON.stringify(expectedEventCounts)}.`);
  console.log('La ejecución es idempotente: antes de insertar se borra sólo el marker demo de esta application.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
