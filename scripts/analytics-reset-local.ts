import { execSync } from 'node:child_process';

type ApplicationRow = {
  id: string;
  name: string;
  slug: string;
  event_count: number;
};
const args = process.argv.slice(2);
const index = args.indexOf('--application');
const application = index >= 0 ? args[index + 1] : undefined;
const confirmed = args.includes('--confirm');
if (!application || application.startsWith('--'))
  throw new Error(
    'Uso: pnpm analytics:reset-local --application <slug|id> [--confirm]',
  );
const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;
function runLocalWrangler(command: string): string {
  // shell resolves pnpm correctly as pnpm.cmd on Windows and pnpm on Unix.
  return execSync(
    `pnpm exec wrangler d1 execute corsteno-db --local --command ${JSON.stringify(command)}`,
    { cwd: 'apps/api', encoding: 'utf8', shell: true },
  );
}
function readResults<T>(output: string): T[] {
  const clean = output.replaceAll(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  const match = clean.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/);
  if (!match)
    throw new Error('No se pudo interpretar la respuesta de Wrangler.');
  return (JSON.parse(match[1]) as Array<{ results?: T[] }>).flatMap(
    (item) => item.results ?? [],
  );
}
const escaped = sqlString(application);
const rows = readResults<ApplicationRow>(
  runLocalWrangler(
    `SELECT a.id,a.name,a.slug,COUNT(e.id) event_count FROM applications a LEFT JOIN events e ON e.application_id=a.id WHERE a.id=${escaped} OR a.slug=${escaped} GROUP BY a.id,a.name,a.slug;`,
  ),
);
if (rows.length === 0)
  throw new Error(`No se encontró una application local para: ${application}`);
if (rows.length > 1)
  throw new Error(
    `La referencia coincide con más de una application: ${application}`,
  );
const found = rows[0];
if (!found)
  throw new Error(`No se encontró una application local para: ${application}`);
console.log(
  `Application:\n- id: ${found.id}\n- name: ${found.name}\n- slug: ${found.slug}`,
);
console.log(`Eventos a borrar: ${found.event_count}`);
if (!confirmed) {
  console.log(
    'Preview: no se borró nada. Agrega --confirm para ejecutar el DELETE local.',
  );
  process.exit(0);
}
runLocalWrangler(
  `DELETE FROM events WHERE application_id=${sqlString(found.id)};`,
);
console.log(
  'Eventos eliminados únicamente para esta application local. No se modificaron organizations, projects, applications, usuarios ni auth.',
);
