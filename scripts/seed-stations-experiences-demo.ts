/**
 * Seeds clearly marked, idempotent analytics demo data for the two public
 * station experiences. The events use the same D1 schema and event names as
 * the TUS ESTACIONES demo, but do not need an application credential: this
 * script writes only synthetic records directly to the analytics database.
 *
 * Local is the default target. Remote writes require all explicit production
 * guards below and never touch Workers, secrets, or the public experiences.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_EVENT_NAMES } from '@corsteno/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDirectory = path.join(root, 'apps', 'api');
const wranglerScript = path.join(
  apiDirectory,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
);
const argentinaUtcOffsetMs = 3 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const organizationId = '00000000-0000-4000-8000-000000000080';
const projectId = '00000000-0000-4000-8000-000000000081';
const projectSlug = 'tus-estaciones';
const source = 'seed-stations-experiences-demo';

export const STATIONS_EXPERIENCES_DEMO = {
  laFabrica: {
    organizationId,
    projectId,
    applicationId: '00000000-0000-4000-8000-000000000084',
    experienceId: '00000000-0000-4000-8000-000000000085',
    applicationName: 'LA FÁBRICA',
    experienceName: 'La Fábrica',
    slug: 'la-fabrica',
    demoSeed: 'la-fabrica-demo-v1',
    counts: {
      uniqueUsers: 320,
      sessions: 470,
      app_opened: 620,
      session_started: 470,
      session_ended: 445,
      experience_started: 320,
      experience_finished: 256,
      image_target_detected: 780,
      camera_permission_granted: 285,
      camera_permission_denied: 35,
      photo_studio_opened: 190,
      photo_captured: 125,
      photo_shared: 70,
      passport_opened: 260,
      station_opened: 360,
    },
    stations: [
      { id: 'silos', name: 'Silos' },
      { id: 'open-air', name: 'Open Air' },
      { id: 'escenario', name: 'Escenario' },
      { id: 'cabina', name: 'Cabina' },
      { id: 'el-gigante', name: 'El Gigante' },
      { id: 'la-cantera', name: 'La Cantera' },
    ],
  },
  dahaus: {
    organizationId,
    projectId,
    applicationId: '00000000-0000-4000-8000-000000000086',
    experienceId: '00000000-0000-4000-8000-000000000087',
    applicationName: 'DAHAUS',
    experienceName: 'Dahaus',
    slug: 'dahaus',
    demoSeed: 'dahaus-demo-v1',
    counts: {
      uniqueUsers: 410,
      sessions: 590,
      app_opened: 760,
      session_started: 590,
      session_ended: 560,
      experience_started: 410,
      experience_finished: 328,
      image_target_detected: 980,
      camera_permission_granted: 360,
      camera_permission_denied: 42,
      photo_studio_opened: 250,
      photo_captured: 170,
      photo_shared: 95,
      passport_opened: 340,
      station_opened: 480,
    },
    stations: [
      { id: 'pulso', name: 'El Pulso' },
      { id: 'cabina', name: 'La Cabina' },
      { id: 'senal', name: 'La Señal' },
      { id: 'cierre', name: 'El Cierre' },
      { id: 'la-fecha', name: 'La Fecha' },
      { id: 'after', name: 'El Después' },
    ],
  },
} as const;

type DemoDefinition =
  (typeof STATIONS_EXPERIENCES_DEMO)[keyof typeof STATIONS_EXPERIENCES_DEMO];
type Mode = 'local' | 'remote';
type SeedEvent = {
  id: string;
  event: string;
  userId: string;
  sessionId: string;
  occurredAt: number;
  properties: Record<string, unknown>;
  applicationId?: string;
};
type CountRow = { name: string; value: number };
type Verification = {
  eventCount: number;
  uniqueUsers: number;
  sessions: number;
  byEvent: CountRow[];
  byAction: CountRow[];
  byStation: CountRow[];
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

function assertMode(mode: Mode) {
  const values = [
    process.env.ENVIRONMENT,
    process.env.CLOUDFLARE_ENV,
    process.env.NODE_ENV,
    process.env.WRANGLER_ENV,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  if (mode === 'local') {
    if (
      values.includes('production') ||
      process.argv.includes('--confirm-remote')
    )
      throw new Error(
        'Bloqueado: --local no puede ejecutarse en production ni con guardas remotas.',
      );
    return;
  }
  loadProductionEnvironment();
  if (
    !process.argv.includes('--execute') ||
    !process.argv.includes('--confirm-remote')
  )
    throw new Error(
      'Bloqueado: un seed remoto requiere --execute --confirm-remote.',
    );
  if (
    process.env.ENVIRONMENT !== 'production' ||
    process.env.RESET_PRODUCTION_DATABASE !== 'corsteno-db' ||
    process.env.ALLOW_STATIONS_DEMO_REMOTE !== 'true'
  ) {
    throw new Error(
      'Bloqueado: un seed remoto requiere ENVIRONMENT=production, RESET_PRODUCTION_DATABASE=corsteno-db y ALLOW_STATIONS_DEMO_REMOTE=true.',
    );
  }
}

function runWrangler(mode: Mode, args: string[], capture = false) {
  const environmentArgs = mode === 'local' ? ['--env', 'development'] : [];
  return execFileSync(
    process.execPath,
    [wranglerScript, ...environmentArgs, ...args],
    {
      cwd: apiDirectory,
      encoding: 'utf8',
      stdio: capture
        ? ['ignore', 'pipe', 'inherit']
        : ['ignore', 'ignore', 'inherit'],
    },
  );
}

function queryRows<T>(mode: Mode, sql: string): T[] {
  const raw = runWrangler(
    mode,
    [
      'd1',
      'execute',
      'corsteno-db',
      mode === 'local' ? '--local' : '--remote',
      '--command',
      sql,
      '--json',
    ],
    true,
  ) as string;
  const payload = JSON.parse(raw) as Array<{ results?: T[] }>;
  return payload[0]?.results ?? [];
}

async function executeSql(mode: Mode, sql: string) {
  const file = path.join(
    root,
    `.corsteno-stations-experiences-${process.pid}.sql`,
  );
  await writeFile(file, sql, { encoding: 'utf8', flag: 'wx' });
  try {
    runWrangler(mode, [
      'd1',
      'execute',
      'corsteno-db',
      mode === 'local' ? '--local' : '--remote',
      '--file',
      file,
    ]);
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

function assertIdentity(mode: Mode, table: string, id: string, slug: string) {
  const rows = queryRows<{ id: string; slug: string }>(
    mode,
    `SELECT id,slug FROM ${table} WHERE id=${quote(id)} OR slug=${quote(slug)}`,
  );
  for (const row of rows)
    if (row.id !== id || row.slug !== slug)
      throw new Error(
        `La identidad ${table}/${slug} ya pertenece a otro registro.`,
      );
}

function assertReferenceData(mode: Mode) {
  const organization = queryRows<{ id: string; slug: string }>(
    mode,
    `SELECT id,slug FROM organizations WHERE id=${quote(organizationId)} AND slug='la-estacion'`,
  );
  if (organization.length !== 1)
    throw new Error('No se encontró la organización esperada de La Estación.');
  const project = queryRows<{ id: string; slug: string }>(
    mode,
    `SELECT id,slug FROM projects WHERE id=${quote(projectId)} AND organization_id=${quote(organizationId)} AND slug=${quote(projectSlug)}`,
  );
  if (project.length !== 1)
    throw new Error('No se encontró el proyecto esperado de TUS ESTACIONES.');
  for (const definition of Object.values(STATIONS_EXPERIENCES_DEMO)) {
    assertIdentity(
      mode,
      'applications',
      definition.applicationId,
      definition.slug,
    );
    assertIdentity(
      mode,
      'experiences',
      definition.experienceId,
      definition.slug,
    );
  }
}

function assertSchema(mode: Mode) {
  const events = queryRows<{ name: string }>(mode, 'PRAGMA table_info(events)');
  const experiences = queryRows<{ name: string }>(
    mode,
    'PRAGMA table_info(experiences)',
  );
  const applications = queryRows<{ name: string }>(
    mode,
    'PRAGMA table_info(applications)',
  );
  const requiredEventColumns = [
    'organization_id',
    'project_id',
    'application_id',
    'event_name',
    'properties',
    'occurred_at',
  ];
  const requiredExperienceColumns = ['project_id', 'application_id'];
  const requiredApplicationColumns = ['application_type'];
  if (
    !requiredEventColumns.every((column) =>
      events.some((item) => item.name === column),
    ) ||
    !requiredExperienceColumns.every((column) =>
      experiences.some((item) => item.name === column),
    ) ||
    !requiredApplicationColumns.every((column) =>
      applications.some((item) => item.name === column),
    )
  ) {
    throw new Error(
      'Aplicá las migraciones locales antes de preparar el demo.',
    );
  }
}

function provisionSql() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  return [
    'PRAGMA foreign_keys=ON;',
    ...Object.values(STATIONS_EXPERIENCES_DEMO).flatMap((definition) => [
      `INSERT INTO applications (id,organization_id,project_id,name,slug,status,application_type,created_at,updated_at) VALUES (${quote(definition.applicationId)},${quote(organizationId)},${quote(projectId)},${quote(definition.applicationName)},${quote(definition.slug)},'active','generic',${now},${now}) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,project_id=excluded.project_id,name=excluded.name,slug=excluded.slug,status='active',application_type='generic',updated_at=excluded.updated_at;`,
      `INSERT INTO experiences (id,organization_id,name,slug,type,status,schema_version,draft_config,published_config,starts_at,ends_at,project_id,application_id,created_at,updated_at) VALUES (${quote(definition.experienceId)},${quote(organizationId)},${quote(definition.experienceName)},${quote(definition.slug)},'ar','published',1,${json({ schemaVersion: 1, external: true })},${json({ schemaVersion: 1, external: true })},NULL,NULL,${quote(projectId)},${quote(definition.applicationId)},${quote(nowIso)},${quote(nowIso)}) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,name=excluded.name,slug=excluded.slug,type='ar',status='published',schema_version=1,draft_config=excluded.draft_config,published_config=excluded.published_config,starts_at=NULL,ends_at=NULL,project_id=excluded.project_id,application_id=excluded.application_id,updated_at=excluded.updated_at;`,
    ]),
  ].join('\n');
}

function deleteDemoEventsSql(definition: DemoDefinition) {
  return `DELETE FROM events WHERE application_id=${quote(definition.applicationId)} AND json_extract(properties,'$.demoSeed')=${quote(definition.demoSeed)};`;
}

function deterministicRandom(seed: number) {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
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
  if (deterministicRandom(seed + 17) < 0.68)
    return night[Math.floor(deterministicRandom(seed + 31) * night.length)]!;
  return Math.floor(deterministicRandom(seed + 47) * 20) + 4;
}

function localTimestamp(now: number, seed: number) {
  const localNow = new Date(now - argentinaUtcOffsetMs);
  const localDayStart =
    Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
    ) + argentinaUtcOffsetMs;
  const day = weightedDay(seed);
  const hour = activityHour(seed);
  const minute = Math.floor(deterministicRandom(seed + 61) * 60);
  let timestamp =
    localDayStart - day * dayMs + hour * 60 * 60 * 1000 + minute * 60 * 1000;
  const latest = now - 20 * 60 * 1000;
  if (timestamp > latest) timestamp -= dayMs;
  return Math.min(latest, Math.max(now - 7 * dayMs + 5 * 60 * 1000, timestamp));
}

function stationFor(definition: DemoDefinition, seed: number) {
  const weights = [1.25, 1.1, 1, 0.9, 0.8, 0.65];
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = deterministicRandom(seed + 701) * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index]!;
    if (cursor <= 0) return definition.stations[index]!;
  }
  return definition.stations.at(-1)!;
}

function baseProperties(
  definition: DemoDefinition,
  properties: Record<string, unknown> = {},
) {
  return {
    demo: true,
    demoSeed: definition.demoSeed,
    source,
    experience: definition.slug,
    ...properties,
  };
}

function eventId(definition: DemoDefinition, index: number) {
  return `${definition.slug}-${definition.demoSeed}-${String(index + 1).padStart(5, '0')}`;
}

function generateEvents(
  definition: DemoDefinition,
  now = Date.now(),
): SeedEvent[] {
  const counts = definition.counts;
  const users = Array.from(
    { length: counts.uniqueUsers },
    (_, index) =>
      `${definition.slug}-demo-user-${String(index + 1).padStart(3, '0')}`,
  );
  const sessions = Array.from({ length: counts.sessions }, (_, index) => ({
    id: `${definition.slug}-demo-session-${String(index + 1).padStart(3, '0')}`,
    userId:
      users[
        index < users.length
          ? index
          : Math.floor(deterministicRandom(index + 101) * users.length)
      ]!,
    startedAt: localTimestamp(
      now,
      index + (definition.slug === 'dahaus' ? 3000 : 1000),
    ),
  }));
  const events: SeedEvent[] = [];
  let sequence = 0;
  const add = (
    event: string,
    index: number,
    properties: Record<string, unknown>,
    sessionIndex = index,
    offsetMs = 0,
  ) => {
    if (!(KNOWN_EVENT_NAMES as readonly string[]).includes(event))
      throw new Error(`Evento no permitido por KNOWN_EVENT_NAMES: ${event}`);
    const session = sessions[sessionIndex % sessions.length]!;
    const occurredAt = Math.min(
      now - 5 * 60 * 1000,
      Math.max(now - 7 * dayMs + 5 * 60 * 1000, session.startedAt + offsetMs),
    );
    events.push({
      id: eventId(definition, sequence),
      event,
      userId: session.userId,
      sessionId: session.id,
      occurredAt,
      properties: baseProperties(definition, properties),
    });
    sequence += 1;
  };

  for (let index = 0; index < counts.session_started; index += 1)
    add('session_started', index, { surface: 'public_experience' }, index);
  for (let index = 0; index < counts.session_ended; index += 1)
    add(
      'session_ended',
      index,
      { surface: 'public_experience' },
      index,
      13 * 60 * 1000,
    );
  for (let index = 0; index < counts.app_opened; index += 1)
    add(
      'app_opened',
      index,
      { surface: 'public_experience' },
      index % sessions.length,
      30 * 1000 + (index % 7) * 11 * 1000,
    );
  for (let index = 0; index < counts.experience_started; index += 1)
    add(
      'experience_started',
      index,
      { experience: definition.slug },
      index * 2,
      2 * 60 * 1000,
    );
  for (let index = 0; index < counts.experience_finished; index += 1)
    add(
      'experience_finished',
      index,
      { experience: definition.slug },
      index * 2,
      18 * 60 * 1000,
    );
  for (let index = 0; index < counts.image_target_detected; index += 1) {
    const station = stationFor(definition, index);
    add(
      'image_target_detected',
      index,
      {
        stationId: station.id,
        stationName: station.name,
        interaction: 'station_unlocked',
      },
      index * 3,
      4 * 60 * 1000,
    );
  }
  for (let index = 0; index < counts.camera_permission_granted; index += 1)
    add(
      'camera_permission_granted',
      index,
      { permission: 'camera' },
      index * 3,
      3 * 60 * 1000,
    );
  for (let index = 0; index < counts.camera_permission_denied; index += 1)
    add(
      'camera_permission_denied',
      index,
      { permission: 'camera' },
      index * 5,
      3 * 60 * 1000,
    );

  const actions: Array<[string, number]> = [
    ['photo_studio_opened', counts.photo_studio_opened],
    ['photo_captured', counts.photo_captured],
    ['photo_shared', counts.photo_shared],
    ['passport_opened', counts.passport_opened],
    ['station_opened', counts.station_opened],
  ];
  let actionIndex = 0;
  for (const [action, count] of actions) {
    for (let index = 0; index < count; index += 1) {
      add(
        'button_clicked',
        actionIndex,
        { action },
        actionIndex * 2,
        6 * 60 * 1000 + (actionIndex % 5) * 17 * 1000,
      );
      actionIndex += 1;
    }
  }
  return events.sort(
    (left, right) =>
      left.occurredAt - right.occurredAt ||
      left.event.localeCompare(right.event) ||
      left.id.localeCompare(right.id),
  );
}

function insertSql(events: SeedEvent[]) {
  return events
    .map(
      (event) =>
        `INSERT INTO events (id,organization_id,project_id,application_id,event_name,anonymous_user_id,session_id,properties,occurred_at,created_at) VALUES (${quote(event.id)},${quote(organizationId)},${quote(projectId)},${quote(event.applicationId ?? '')},${quote(event.event)},${quote(event.userId)},${quote(event.sessionId)},${json(event.properties)},${event.occurredAt},${event.occurredAt});`,
    )
    .join('\n');
}

function expectedEventCounts(
  definition: DemoDefinition,
): Record<string, number> {
  return {
    session_started: definition.counts.session_started,
    session_ended: definition.counts.session_ended,
    app_opened: definition.counts.app_opened,
    experience_started: definition.counts.experience_started,
    experience_finished: definition.counts.experience_finished,
    image_target_detected: definition.counts.image_target_detected,
    camera_permission_granted: definition.counts.camera_permission_granted,
    camera_permission_denied: definition.counts.camera_permission_denied,
    button_clicked:
      definition.counts.photo_studio_opened +
      definition.counts.photo_captured +
      definition.counts.photo_shared +
      definition.counts.passport_opened +
      definition.counts.station_opened,
  };
}

function expectedActionCounts(
  definition: DemoDefinition,
): Record<string, number> {
  return {
    photo_studio_opened: definition.counts.photo_studio_opened,
    photo_captured: definition.counts.photo_captured,
    photo_shared: definition.counts.photo_shared,
    passport_opened: definition.counts.passport_opened,
    station_opened: definition.counts.station_opened,
  };
}

function verify(mode: Mode, definition: DemoDefinition): Verification {
  const applicationId = quote(definition.applicationId);
  const marker = quote(definition.demoSeed);
  const summary = queryRows<{
    eventCount: number;
    uniqueUsers: number;
    sessions: number;
  }>(
    mode,
    `SELECT COUNT(*) eventCount,COUNT(DISTINCT anonymous_user_id) uniqueUsers,COUNT(DISTINCT session_id) sessions FROM events WHERE application_id=${applicationId} AND json_extract(properties,'$.demoSeed')=${marker}`,
  )[0] ?? { eventCount: 0, uniqueUsers: 0, sessions: 0 };
  const byEvent = queryRows<CountRow>(
    mode,
    `SELECT event_name name,COUNT(*) value FROM events WHERE application_id=${applicationId} AND json_extract(properties,'$.demoSeed')=${marker} GROUP BY event_name ORDER BY event_name`,
  );
  const byAction = queryRows<CountRow>(
    mode,
    `SELECT json_extract(properties,'$.action') name,COUNT(*) value FROM events WHERE application_id=${applicationId} AND json_extract(properties,'$.demoSeed')=${marker} AND json_extract(properties,'$.action') IS NOT NULL GROUP BY name ORDER BY name`,
  );
  const byStation = queryRows<CountRow>(
    mode,
    `SELECT COALESCE(json_extract(properties,'$.stationName'),json_extract(properties,'$.stationId')) name,COUNT(*) value FROM events WHERE application_id=${applicationId} AND json_extract(properties,'$.demoSeed')=${marker} AND COALESCE(json_extract(properties,'$.stationName'),json_extract(properties,'$.stationId')) IS NOT NULL GROUP BY name ORDER BY value DESC,name LIMIT 10`,
  );
  return { ...summary, byEvent, byAction, byStation };
}

function assertVerification(definition: DemoDefinition, result: Verification) {
  const expectedEvents = expectedEventCounts(definition);
  const expectedActions = expectedActionCounts(definition);
  const expectedTotal = Object.values(expectedEvents).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (
    result.eventCount !== expectedTotal ||
    result.uniqueUsers !== definition.counts.uniqueUsers ||
    result.sessions !== definition.counts.sessions
  ) {
    throw new Error(
      `Verificación incompleta para ${definition.slug}: ${JSON.stringify(result)}`,
    );
  }
  const actualEvents = new Map(
    result.byEvent.map((row) => [row.name, Number(row.value)]),
  );
  for (const [event, count] of Object.entries(expectedEvents))
    if (actualEvents.get(event) !== count)
      throw new Error(
        `Verificación incompleta para ${definition.slug}/${event}.`,
      );
  const actualActions = new Map(
    result.byAction.map((row) => [row.name, Number(row.value)]),
  );
  for (const [action, count] of Object.entries(expectedActions))
    if (actualActions.get(action) !== count)
      throw new Error(
        `Verificación incompleta para ${definition.slug}/action=${action}.`,
      );
  if (result.byStation.length !== definition.stations.length)
    throw new Error(
      `Verificación incompleta para ${definition.slug}: faltan estaciones en el breakdown.`,
    );
}

async function seedDefinition(mode: Mode, definition: DemoDefinition) {
  await executeSql(mode, deleteDemoEventsSql(definition));
  const events = generateEvents(definition);
  const chunkSize = 500;
  for (let index = 0; index < events.length; index += chunkSize) {
    const chunk = events
      .slice(index, index + chunkSize)
      .map((event) => ({ ...event, applicationId: definition.applicationId }));
    await executeSql(mode, insertSql(chunk));
  }
  const result = verify(mode, definition);
  assertVerification(definition, result);
  console.log(
    JSON.stringify(
      {
        application: definition.applicationName,
        applicationId: definition.applicationId,
        experienceId: definition.experienceId,
        slug: definition.slug,
        demoSeed: definition.demoSeed,
        eventCount: result.eventCount,
        uniqueUsers: result.uniqueUsers,
        sessions: result.sessions,
        byEvent: result.byEvent,
        byAction: result.byAction,
        byStation: result.byStation,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const mode = modeFromArgs();
  const reset = process.argv.includes('--reset');
  const verifyOnly = process.argv.includes('--verify');
  if (reset && verifyOnly)
    throw new Error('Elegí una sola acción entre --reset y --verify.');
  assertMode(mode);
  assertReferenceData(mode);
  assertSchema(mode);

  if (verifyOnly) {
    for (const definition of Object.values(STATIONS_EXPERIENCES_DEMO)) {
      const result = verify(mode, definition);
      console.log(
        JSON.stringify(
          { slug: definition.slug, demoSeed: definition.demoSeed, ...result },
          null,
          2,
        ),
      );
      assertVerification(definition, result);
    }
    return;
  }

  if (reset) {
    for (const definition of Object.values(STATIONS_EXPERIENCES_DEMO))
      await executeSql(mode, deleteDemoEventsSql(definition));
    console.log(
      'Reset demo completo: sólo se eliminaron eventos con los markers de La Fábrica y Dahaus.',
    );
    return;
  }

  await executeSql(mode, provisionSql());
  for (const definition of Object.values(STATIONS_EXPERIENCES_DEMO))
    await seedDefinition(mode, definition);
  console.log(
    `Seed idempotente listo en D1 ${mode}; ventana temporal: últimos 7 días.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
