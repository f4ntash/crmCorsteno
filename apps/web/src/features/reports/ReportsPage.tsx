import { useEffect, useMemo, useState } from 'react';
import { apiDownload, apiRequest, ApiError } from '../../shared/api/client';
import { downloadCsv } from './download';

type Project = { id: string; name: string };
type Application = { id: string; name: string; projectId: string; applicationType?: string };
type Report = { id: string; title: string; description: string; scope: 'application' | 'organization'; format: 'csv'; requiresApplication: boolean; applicationTypes: string[] | null };
type ReportsResponse = { reports: Report[] };

const typeLabels: Record<string, string> = { roulette: 'Roulette', 'product-catalog': 'Catálogo de productos', game: 'Juego', webar: 'WebAR', generic: 'Experiencia' };
const rangeLabels: Record<string, string> = { '24h': 'Últimas 24 horas', '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', all: 'Todo el período' };

function reportSuffix(reportId: string) {
  if (reportId.startsWith('roulette.')) return 'resultados';
  if (reportId.startsWith('catalog.')) return 'inventario-productos';
  return 'actividad';
}

export function ReportsPage({ org }: { org: string }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [range, setRange] = useState('7d');
  const [project, setProject] = useState('');
  const [application, setApplication] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersError, setFiltersError] = useState('');
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportMessage, setExportMessage] = useState('');

  useEffect(() => {
    if (!org) return;
    setLoading(true);
    setError('');
    setFiltersError('');
    void Promise.allSettled([
      apiRequest<ReportsResponse>('/reports', org),
      apiRequest<Project[]>('/projects', org),
      apiRequest<Application[]>('/applications', org),
    ]).then(([reportsResult, projectsResult, applicationsResult]) => {
      if (reportsResult.status === 'fulfilled') setReports(reportsResult.value.reports); else setError('No se pudieron cargar los reportes.');
      if (projectsResult.status === 'fulfilled') setProjects(projectsResult.value); else setFiltersError('No se pudieron cargar los proyectos.');
      if (applicationsResult.status === 'fulfilled') setApplications(applicationsResult.value); else setFiltersError((current) => current ? `${current} Tampoco se pudieron cargar las aplicaciones.` : 'No se pudieron cargar las aplicaciones.');
    }).finally(() => setLoading(false));
  }, [org]);

  const filteredApplications = useMemo(() => project ? applications.filter((item) => item.projectId === project) : applications, [applications, project]);
  const selectedApplication = applications.find((item) => item.id === application);
  const visibleReports = reports.filter((report) => report.scope === 'organization' || !report.applicationTypes?.length || Boolean(selectedApplication && report.applicationTypes.includes(selectedApplication.applicationType ?? 'generic')));
  async function exportReport(report: Report) {
    if ((report.requiresApplication && !application) || exporting) return;
    setExporting(report.id);
    setExportError('');
    setExportMessage('');
    try {
      const query = new URLSearchParams({ range, ...(report.requiresApplication && application ? { applicationId: application } : {}), ...(report.requiresApplication && project ? { projectId: project } : {}) });
      const blob = await apiDownload(`/reports/${encodeURIComponent(report.id)}?${query.toString()}`, org);
      downloadCsv(blob, report.scope === 'organization' ? 'productos' : selectedApplication?.name ?? 'experiencia', reportSuffix(report.id));
      setExportMessage('CSV descargado correctamente.');
    } catch (cause) {
      setExportError(cause instanceof ApiError ? cause.message : 'No se pudo exportar el reporte.');
    } finally {
      setExporting('');
    }
  }

  function chooseProject(value: string) {
    setProject(value);
    if (application && !applications.some((item) => item.id === application && (!value || item.projectId === value))) setApplication('');
    setExportError('');
  }

  if (loading) return <main className="page reports-page"><div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando reportes…</div></main>;
  return <main className="page reports-page">
    <div className="page-heading"><div><p className="eyebrow">DATOS / EXPORTACIONES</p><h1>Reportes</h1><p className="page-description">Exportá información operativa de tus aplicaciones en CSV.</p></div></div>
    {error ? <div className="empty" role="alert"><h2>{error}</h2><p>Podés volver a intentarlo desde esta pantalla.</p></div> : <>
      <section className="analytics-toolbar reports-toolbar" aria-label="Filtros de reportes"><div className="toolbar-heading"><strong>Elegí el alcance</strong><span>Los reportes usan la misma selección de aplicación y período que Resultados.</span></div><div className="filters">
        <label>Período<select value={range} onChange={(event) => setRange(event.target.value)}>{Object.entries(rangeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Proyecto<select value={project} onChange={(event) => chooseProject(event.target.value)}><option value="">Todos los proyectos</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Aplicación<select value={application} onChange={(event) => { setApplication(event.target.value); setExportError(''); }}><option value="">Seleccioná una aplicación</option>{filteredApplications.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>{filtersError && <p className="reports-inline-error" role="alert">{filtersError}</p>}</section>
      {exportError && <p className="analytics-export-error" role="alert">{exportError}</p>}
      {exportMessage && <p className="reports-success" role="status">{exportMessage}</p>}
      <section className="reports-list" aria-label="Reportes disponibles"><div className="section-heading"><div><p className="eyebrow">REPORTES DISPONIBLES</p><h2>Exportaciones</h2></div><span>{selectedApplication ? `${selectedApplication.name} · ${typeLabels[selectedApplication.applicationType ?? 'generic'] ?? 'Experiencia'}` : 'Aplicación no seleccionada'}</span></div>
        {visibleReports.length === 0 ? <div className="empty"><h2>No hay reportes aplicables</h2><p>Seleccioná una aplicación compatible para ver sus exportaciones.</p></div> : <div className="report-list">{visibleReports.map((report) => <article className="report-row" key={report.id}><div><h2>{report.title}</h2><p>{report.description}</p><small>Alcance: {report.scope === 'organization' ? 'organización' : 'aplicación seleccionada'} · Formato: {report.format.toUpperCase()} · {rangeLabels[range]}</small>{report.id.startsWith('roulette.') && <small>Incluye resultados Roulette, claims y bloqueos; sólo datos del período seleccionado.</small>}</div><button type="button" className="secondary" disabled={(report.requiresApplication && !application) || Boolean(exporting)} onClick={() => void exportReport(report)}>{exporting === report.id ? 'Exportando…' : report.requiresApplication && !application ? 'Seleccioná aplicación' : 'Exportar CSV'}</button></article>)}</div>}
      </section>
    </>}
  </main>;
}
