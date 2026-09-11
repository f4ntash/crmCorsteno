import { describe, expect, it } from 'vitest';
import { ensureExperienceAnalyticsApplication } from '../src/services/experience-analytics';

type Call = { sql: string; args: unknown[] };

function database(existingApplicationId: string | null = null) {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          return {
            async first<T>() {
              if (sql.includes('SELECT application_id applicationId')) return (existingApplicationId ? { applicationId: existingApplicationId } : null) as T;
              if (sql.includes('SELECT id FROM projects')) return { id: 'project-1' } as T;
              if (sql.includes('SELECT id FROM applications')) return { id: 'application-1' } as T;
              return null as T;
            },
            async run() { return { success: true, meta: { changes: 1 } }; },
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
});
