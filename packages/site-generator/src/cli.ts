import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { generateSite, parseCliArgs, validateOptions, type SiteOptions } from './generator';

const usage = `Uso:
  pnpm create:site -- --name "Cliente" --slug "cliente" --site-key "site_..." --api-url "http://localhost:8787" --out "../cliente"

Si faltan argumentos, el comando los solicita de forma interactiva.
`;

async function promptMissing(partial: ReturnType<typeof parseCliArgs>) {
  const rl = createInterface({ input, output });
  const ask = async (label: string, current: string | undefined) => current?.trim() || rl.question(`${label}: `);
  try {
    return {
      name: await ask('Nombre del proyecto', partial.name),
      slug: await ask('Slug', partial.slug),
      siteKey: await ask('Site Key', partial.siteKey),
      apiUrl: await ask('API URL', partial.apiUrl),
      out: await ask('Carpeta destino', partial.out),
    } satisfies SiteOptions;
  } finally {
    rl.close();
  }
}

async function main() {
  try {
    const parsed = parseCliArgs(process.argv.slice(2));
    if (parsed.help) {
      process.stdout.write(usage);
      return;
    }
    const options = validateOptions(await promptMissing(parsed));
    const result = await generateSite(options);
    process.stdout.write(`Sitio generado en ${result.destination}\n`);
    process.stdout.write('Próximos pasos: cd a la carpeta, pnpm install y pnpm dev.\n');
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : 'No se pudo generar el sitio.'}\n`);
    process.exitCode = 1;
  }
}

void main();
