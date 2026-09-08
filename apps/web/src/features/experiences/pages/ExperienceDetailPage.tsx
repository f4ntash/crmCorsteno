import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiRequest } from '../../../shared/api/client';
import { experienceEditors } from '../registry';
import { ExperienceQrModal } from '../components/ExperienceQrModal';
import { PublishControls } from '../components/PublishControls';
import { SpinHistory } from '../components/SpinHistory';
import { ClaimsPanel } from '../components/ClaimsPanel';
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(path: string, org?: string, init?: RequestInit) { return apiRequest<T>(path, org, init); }
const runtime = import.meta.env.VITE_RUNTIME_BASE_URL ?? 'http://localhost:5174';
export function ExperienceDetailPage({ org, permissions }: { org: string; permissions: string[] }) {
  const location = useLocation();
  const id = location.pathname.match(/^\/app\/experiences\/([^/]+)$/)?.[1] ?? '';
  const [experience, setExperience] = useState<{ id: string; type: string; slug: string; draftConfig?: { prizes?: Array<{ id: string; name: string }> } }>();
  useEffect(() => { if (!id || !org) return; get(`/experiences/${id}`, org).then(setExperience).catch(() => setExperience(undefined)); }, [id, org]);
  if (!id || !experience) return null;
  const Editor = experienceEditors[experience.type as keyof typeof experienceEditors];
  const prizes = experience.draftConfig?.prizes ?? [];
  return <><PublishControls organizationId={org} canPublish={permissions.includes('crm.manage')} /><div className="route-qr"><ExperienceQrModal slug={experience.slug} runtimeBaseUrl={runtime} /></div>{Editor ? <Editor org={org} id={id} canEdit={permissions.includes('crm.manage')} canAdjustInventory={permissions.includes('crm.manage')} /> : <main className="page"><p>Esta experiencia todavía no tiene un editor disponible.</p></main>}<SpinHistory experienceId={id} organizationId={org} prizes={prizes} /><ClaimsPanel experienceId={id} organizationId={org} canRedeem={permissions.includes('crm.manage')} /></>;
}
