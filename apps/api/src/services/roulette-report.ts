import { csvDocument, reportFilename } from './report-csv';
import { reportRangeOf, reportSinceOf, reportSinceIsoOf } from './report-filters';
import { ReportRequestError, type ReportContext, type ReportFile } from './report-types';

type RouletteExportContext = {
  id: string;
  name: string;
  applicationId: string | null;
  type: string;
  applicationType: string | null;
  publishedConfig: string | null;
  draftConfig: string | null;
};
type RouletteExportSpin = {
  createdAt: string;
  experienceId: string;
  experienceName: string;
  outcomeType: 'prize' | 'no_prize';
  prizeId: string | null;
  claimPrizeName: string | null;
  claimCode: string | null;
  claimStatus: 'active' | 'redeemed' | null;
  redeemedAt: string | null;
};
type RouletteBlockedEvent = { occurredAt: number; properties: string | null };
export type RouletteExportRow = {
  occurredAt: string;
  experience: string;
  resultType: 'win' | 'no_prize' | 'blocked';
  prizeName: string;
  claimCode: string;
  claimStatus: string;
  redeemedAt: string;
  blockReason: string;
};

const ROULETTE_HEADER = ['fecha_hora_utc', 'experiencia', 'tipo_resultado', 'premio', 'codigo_claim', 'estado_claim', 'canjeado_en_utc', 'motivo_bloqueo'];

export function rouletteResultsCsv(rows: RouletteExportRow[]) {
  return csvDocument(ROULETTE_HEADER, rows.map((row) => [row.occurredAt, row.experience, row.resultType, row.prizeName, row.claimCode, row.claimStatus, row.redeemedAt, row.blockReason]));
}

function utcIso(value: string | number) {
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
  }
  const raw = String(value);
  const normalized = !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : raw;
}

function prizeNames(configValue: string | null) {
  const names = new Map<string, string>();
  try {
    const config = configValue ? JSON.parse(configValue) as { prizes?: Array<{ id?: unknown; name?: unknown }> } : null;
    for (const prize of config?.prizes ?? []) {
      if (typeof prize.id === 'string' && typeof prize.name === 'string') names.set(prize.id, prize.name);
    }
  } catch { /* The export still includes the authoritative spin and claim fields. */ }
  return names;
}

function eventProperties(value: string | null) {
  try {
    const parsed = value ? JSON.parse(value) as Record<string, unknown> : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export async function exportRouletteResults(context: ReportContext): Promise<ReportFile> {
  const query = context.query;
  const organizationId = context.organizationId;
  const applicationId = query.get('applicationId')?.trim() || null;
  const experienceId = query.get('experienceId')?.trim() || null;
  const projectId = query.get('projectId')?.trim() || null;
  if (!applicationId && !experienceId) throw new ReportRequestError(400, 'BAD_REQUEST', 'Seleccioná una aplicación o experiencia Roulette.');

  const application = applicationId
    ? await context.db.prepare(`SELECT id,name,project_id projectId,application_type applicationType FROM applications WHERE id=? AND organization_id=?${projectId ? ' AND project_id=?' : ''}`).bind(...(projectId ? [applicationId, organizationId, projectId] : [applicationId, organizationId])).first<{ id: string; name: string; projectId: string; applicationType: string }>()
    : null;
  if (applicationId && !application) throw new ReportRequestError(404, 'NOT_FOUND', 'Aplicación no encontrada.');
  if (application && application.applicationType !== 'roulette') throw new ReportRequestError(422, 'ROULETTE_EXPORT_NOT_AVAILABLE', 'La exportación CSV solo está disponible para aplicaciones Roulette.');

  const experienceValues: (string | number)[] = [organizationId];
  let experienceWhere = "e.organization_id=? AND e.type='roulette'";
  if (applicationId) { experienceWhere += ' AND e.application_id=?'; experienceValues.push(applicationId); }
  if (experienceId) { experienceWhere += ' AND e.id=?'; experienceValues.push(experienceId); }
  if (projectId) { experienceWhere += ' AND a.project_id=?'; experienceValues.push(projectId); }
  const experiences = await context.db.prepare(`SELECT e.id,e.name,e.application_id applicationId,e.type,a.application_type applicationType,e.published_config publishedConfig,e.draft_config draftConfig FROM experiences e LEFT JOIN applications a ON a.id=e.application_id AND a.organization_id=e.organization_id WHERE ${experienceWhere} ORDER BY e.created_at ASC`).bind(...experienceValues).all<RouletteExportContext>();
  if (experienceId && !experiences.results.length) throw new ReportRequestError(404, 'NOT_FOUND', 'Experiencia no encontrada.');
  if (experienceId && experiences.results[0]?.applicationType && experiences.results[0].applicationType !== 'roulette') throw new ReportRequestError(422, 'ROULETTE_EXPORT_NOT_AVAILABLE', 'La exportación CSV solo está disponible para experiencias Roulette.');

  const range = reportRangeOf(query.get('range'));
  const spinValues: (string | number)[] = [organizationId, reportSinceIsoOf(range)];
  let spinWhere = "s.organization_id=? AND datetime(s.created_at)>=datetime(?) AND e.type='roulette'";
  if (applicationId) { spinWhere += ' AND s.application_id=?'; spinValues.push(applicationId); }
  if (experienceId) { spinWhere += ' AND s.experience_id=?'; spinValues.push(experienceId); }
  if (projectId) { spinWhere += ' AND a.project_id=?'; spinValues.push(projectId); }
  const spins = await context.db.prepare(`SELECT s.created_at createdAt,s.experience_id experienceId,e.name experienceName,s.outcome_type outcomeType,s.prize_id prizeId,c.prize_name claimPrizeName,c.code claimCode,c.status claimStatus,c.redeemed_at redeemedAt FROM experience_spins s JOIN experiences e ON e.id=s.experience_id AND e.organization_id=s.organization_id LEFT JOIN applications a ON a.id=e.application_id AND a.organization_id=e.organization_id LEFT JOIN roulette_prize_claims c ON c.spin_id=s.id AND c.experience_id=s.experience_id AND c.organization_id=s.organization_id WHERE ${spinWhere} ORDER BY s.created_at ASC,s.id ASC`).bind(...spinValues).all<RouletteExportSpin>();

  const scopedApplicationId = applicationId ?? experiences.results[0]?.applicationId ?? null;
  const blockedValues: (string | number)[] = [organizationId, scopedApplicationId ?? ''];
  const blockedWhere = "organization_id=? AND application_id=? AND event_name='roulette_spin_blocked' AND occurred_at>=?";
  blockedValues.push(reportSinceOf(range));
  const blockedEvents = scopedApplicationId
    ? await context.db.prepare(`SELECT occurred_at occurredAt,properties FROM events WHERE ${blockedWhere} ORDER BY occurred_at ASC`).bind(...blockedValues).all<RouletteBlockedEvent>()
    : { results: [] as RouletteBlockedEvent[] };

  const contextById = new Map(experiences.results.map((item) => [item.id, item]));
  const namesByExperience = new Map(experiences.results.map((item) => [item.id, prizeNames(item.publishedConfig ?? item.draftConfig)]));
  const rows: RouletteExportRow[] = spins.results.map((spin) => ({
    occurredAt: utcIso(spin.createdAt),
    experience: spin.experienceName,
    resultType: spin.outcomeType === 'prize' ? 'win' : 'no_prize',
    prizeName: spin.claimPrizeName ?? (spin.prizeId ? namesByExperience.get(spin.experienceId)?.get(spin.prizeId) ?? '' : ''),
    claimCode: spin.claimCode ?? '',
    claimStatus: spin.claimStatus ?? '',
    redeemedAt: spin.redeemedAt ? utcIso(spin.redeemedAt) : '',
    blockReason: '',
  }));
  for (const event of blockedEvents.results) {
    const properties = eventProperties(event.properties);
    const blockedExperienceId = typeof properties.experienceId === 'string' ? properties.experienceId : null;
    if (experienceId && blockedExperienceId !== experienceId) continue;
    const experience = blockedExperienceId ? contextById.get(blockedExperienceId) : experiences.results.length === 1 ? experiences.results[0] : undefined;
    rows.push({ occurredAt: utcIso(event.occurredAt), experience: experience?.name ?? '', resultType: 'blocked', prizeName: '', claimCode: '', claimStatus: '', redeemedAt: '', blockReason: typeof properties.reason === 'string' ? properties.reason : '' });
  }
  rows.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  const label = experiences.results.length === 1 ? experiences.results[0]!.name : application?.name ?? 'roulette';
  return {
    body: rouletteResultsCsv(rows),
    filename: reportFilename(label, 'resultados'),
    contentType: 'text/csv; charset=utf-8',
    rowCount: rows.length,
    emptyBehavior: 'download',
  };
}
