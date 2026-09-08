import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../../shared/api/client';
import { experiencesApi } from '../api';
import { experienceEditors } from '../registry';
import { ExperienceQrModal } from '../components/ExperienceQrModal';
import { PublishControls } from '../components/PublishControls';
import { SpinHistory } from '../components/SpinHistory';
import { ClaimsPanel } from '../components/ClaimsPanel';
import { AccessPeriodPanel } from '../components/AccessPeriodPanel';
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(
  path: string,
  org?: string,
  init?: RequestInit,
) {
  return apiRequest<T>(path, org, init);
}
const runtime =
  import.meta.env.VITE_RUNTIME_BASE_URL ?? 'http://localhost:5174';
export function ExperienceDetailPage({
  org,
  permissions,
}: {
  org: string;
  permissions: string[];
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const id =
    location.pathname.match(/^\/app\/experiences\/([^/]+)$/)?.[1] ?? '';
  const [experience, setExperience] = useState<{
    id: string;
    type: string;
    slug: string;
    draftConfig?: { prizes?: Array<{ id: string; name: string }> };
  }>();
  useEffect(() => {
    if (!id || !org) return;
    get(`/experiences/${id}`, org)
      .then(setExperience)
      .catch(() => setExperience(undefined));
  }, [id, org]);
  if (!id || !experience) return null;
  const Editor =
    experienceEditors[experience.type as keyof typeof experienceEditors];
  const prizes = experience.draftConfig?.prizes ?? [];
  async function clone() {
    if (!window.confirm('Se creará una nueva experiencia en estado borrador. Los giros, premios obtenidos y stock no se copiarán. ¿Continuar?')) return;
    try {
      const cloned = await experiencesApi.clone(id, org);
      navigate(`/app/experiences/${cloned.id}`);
    } catch (error) {
      window.alert((error as Error).message);
    }
  }
  return (
    <>
      {permissions.includes('crm.manage') && <button type="button" onClick={clone}>Duplicar experiencia</button>}
      <PublishControls
        organizationId={org}
        canPublish={permissions.includes('crm.manage')}
      />
      <AccessPeriodPanel experienceId={id} organizationId={org} canManage={permissions.includes('crm.manage')} />
      <div className="route-qr">
        <ExperienceQrModal slug={experience.slug} runtimeBaseUrl={runtime} />
      </div>
      {Editor ? (
        <Editor
          org={org}
          id={id}
          canEdit={permissions.includes('crm.manage')}
          canAdjustInventory={permissions.includes('crm.manage')}
        />
      ) : (
        <main className="page">
          <p>Esta experiencia todavía no tiene un editor disponible.</p>
        </main>
      )}
      <SpinHistory experienceId={id} organizationId={org} prizes={prizes} />
      <ClaimsPanel
        experienceId={id}
        organizationId={org}
        canRedeem={permissions.includes('crm.manage')}
      />
    </>
  );
}
