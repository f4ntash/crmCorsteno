import { describe, expect, it } from 'vitest';
import { ensureExperienceAnalyticsApplication } from '../src/services/experience-analytics';

type Call = { sql: string; args: unknown[] };

function database(existingApplicationId: string | null = null, hasProject = true) {
  let linkedApplicationId = existingApplicationId;
  let project = hasProject ? { id: 'project-1' } : null;
  let application: { id: string } | null = null;
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          return {
            async first<T>() {
              if (sql.includes('SELECT application_id applicationId')) return (linkedApplicationId ? { applicationId: linkedApplicationId } : null) as T;
              if (sql.includes('SELECT id FROM projects WHERE organization_id=? AND slug=?')) return project as T;
              if (sql.includes('SELECT id FROM projects')) return project as T;
              if (sql.includes('SELECT id FROM applications')) return application as T;
              return null as T;
            },
            async run() {
              if (sql.includes('INSERT OR IGNORE INTO projects') && !project) project = { id: String(args[0]) };
              if (sql.includes('INSERT OR IGNORE INTO applications') && !application) application = { id: 'application-1' };
              if (sql.startsWith('UPDATE experiences SET project_id')) linkedApplicationId = application?.id ?? null;
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}

describe('experience Analytics application association', () => {
  it('derives application_type and slug from the experience type', async () => {
    const { db, calls } = database();
    await expect(ensureExperienceAnalyticsApplication({ db, experienceId: 'experience-1', organizationId: 'org-1', experienceType: 'test-product', name: 'Evento' })).resolves.toBe('application-1');
    const insert = calls.find((call) => call.sql.includes('INSERT OR IGNORE INTO applications'));
    expect(insert?.args).toEqual([expect.any(String), 'org-1', 'project-1', 'Evento', 'test-product-experience-1', 'test-product', expect.any(Number), expect.any(Number)]);
  });

  it('keeps Roulette associated as application_type roulette', async () => {
    const { db, calls } = database();
    await ensureExperienceAnalyticsApplication({ db, experienceId: 'experience-1', organizationId: 'org-1', experienceType: 'roulette', name: 'Ruleta' });
    const insert = calls.find((call) => call.sql.includes('INSERT OR IGNORE INTO applications'));
    expect(insert?.args[5]).toBe('roulette');
    expect(insert?.args[4]).toBe('roulette-experience-1');
  });

  it('reuses an existing linked application without changing it', async () => {
    const { db, calls } = database('existing-application');
    await expect(ensureExperienceAnalyticsApplication({ db, experienceId: 'experience-1', organizationId: 'org-1', experienceType: 'test-product', name: 'Evento' })).resolves.toBe('existing-application');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('SELECT application_id applicationId');
  });

  it('creates an idempotent organization project when a clean organization has none', async () => {
    const { db, calls } = database(null, false);
    await expect(ensureExperienceAnalyticsApplication({ db, experienceId: 'experience-1', organizationId: 'org-1', experienceType: 'product-catalog', name: 'Catálogo' })).resolves.toBe('application-1');
    const projectInsert = calls.find((call) => call.sql.includes('INSERT OR IGNORE INTO projects'));
    expect(projectInsert?.args).toEqual([expect.any(String), 'org-1', 'Experiencias', 'experiencias', 'active', expect.stringContaining('Proyecto creado'), expect.any(Number), expect.any(Number)]);
    const applicationInsert = calls.find((call) => call.sql.includes('INSERT OR IGNORE INTO applications'));
    expect(applicationInsert?.args[5]).toBe('product-catalog');
    expect(applicationInsert?.args[2]).toBe(projectInsert?.args[0]);
    expect(applicationInsert?.args[4]).toBe('product-catalog-experience-1');
    expect(calls.filter((call) => call.sql.includes('INSERT OR IGNORE INTO projects'))).toHaveLength(1);
    expect(calls.filter((call) => call.sql.includes('INSERT OR IGNORE INTO applications'))).toHaveLength(1);
    await ensureExperienceAnalyticsApplication({ db, experienceId: 'experience-1', organizationId: 'org-1', experienceType: 'product-catalog', name: 'Catálogo' });
    expect(calls.filter((call) => call.sql.includes('INSERT OR IGNORE INTO projects'))).toHaveLength(1);
    expect(calls.filter((call) => call.sql.includes('INSERT OR IGNORE INTO applications'))).toHaveLength(1);
  });

  it('uses existing projects and linked applications without changing Roulette mappings', async () => {
    const { db, calls } = database();
    await ensureExperienceAnalyticsApplication({ db, experienceId: 'experience-1', organizationId: 'org-1', experienceType: 'roulette', name: 'Ruleta' });
    expect(calls.some((call) => call.sql.includes('INSERT OR IGNORE INTO projects'))).toBe(false);
    expect(calls.find((call) => call.sql.includes('INSERT OR IGNORE INTO applications'))?.args[5]).toBe('roulette');
  });
});
