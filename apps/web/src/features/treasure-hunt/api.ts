import { apiDownload, apiRequest, apiRequestWithMeta } from '../../shared/api/client';

export type TreasureHuntSummary = {
  campaignId: string;
  slug: string;
  name: string;
  status: string;
  organizationId: string;
  publishedVersion: number | null;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
  rewardName: string | null;
  draftId?: string;
  draftRevision?: number;
  draftStatus?: string;
  draftIncomplete?: boolean;
  draftIssueCount?: number;
};

export type TreasureHuntStep = { stepId: string; order: number; title: string; clue: string; triggerId: string };
export type TreasureHuntVersion = { id: string; version: number; name: string; description: string; progressionMode: string; publicationStatus: string; createdAt: string; publishedAt: string | null };
export type TreasureHuntReward = { rewardId: string; type: string; name: string; displayValue: string; expiresInSeconds: number | null; status: string };
export type TreasureHuntDraftIssue = { code: string; message: string; stepId?: string };
export type TreasureHuntDraftTarget = { id: string; stepId: string; originalFilename: string; mimeType: string; byteSize: number; checksum: string; status: string; physicalWidthCm: number; widthPx: number | null; heightPx: number | null; featureCount: number | null; createdAt: string; updatedAt: string };
export type TreasureHuntDraftCompilation = { id: string; draftRevision: number; status: 'COMPILE_PENDING' | 'COMPILED' | 'FAILED'; artifactChecksum: string | null; artifactByteSize: number | null; compilerVersion: string | null; mapping: Array<{ stepId: string; order: number; targetIndex: number; physicalWidthCm?: number }>; errorMessage: string | null; compiledAt: string | null };
export type TreasureHuntDraftStep = { stepId: string; order: number; title: string; clue: string; triggerType: 'IMAGE_TARGET'; triggerId: string; targetRef: string | null; targetStatus: 'PENDING' | 'READY'; target: TreasureHuntDraftTarget | null };
export type TreasureHuntDraftReward = { type: 'COUPON'; name: string; displayValue: string; expiresInSeconds: number | null };
export type TreasureHuntDraft = {
  id: string;
  campaignId: string;
  organizationId: string;
  baseCampaignVersionId: string | null;
  basePublishedVersion: number | null;
  revision: number;
  name: string;
  slug: string;
  description: string;
  progressionMode: 'SEQUENTIAL';
  steps: TreasureHuntDraftStep[];
  reward: TreasureHuntDraftReward | null;
  issues: TreasureHuntDraftIssue[];
  incomplete: boolean;
  readiness: 'READY' | 'INCOMPLETE';
  compilation: TreasureHuntDraftCompilation | null;
  createdAt: string;
  updatedAt: string;
};
export type TreasureHuntDetail = Omit<TreasureHuntSummary, 'stepCount' | 'rewardName'> & {
  description: string | null;
  progressionMode: string | null;
  steps: TreasureHuntStep[];
  triggers: Array<{ stepId: string; order: number; triggerId: string }>;
  reward: TreasureHuntReward | null;
  versions: TreasureHuntVersion[];
  draft?: { draftId: string; draftRevision: number; draftStatus: string; draftIncomplete: boolean; draftIssueCount: number } | null;
};

export type TreasureHuntDraftInput = Omit<TreasureHuntDraft, 'id' | 'campaignId' | 'organizationId' | 'baseCampaignVersionId' | 'basePublishedVersion' | 'revision' | 'issues' | 'incomplete' | 'readiness' | 'compilation' | 'createdAt' | 'updatedAt'>;
export type TreasureHuntBrowserCompilationTarget = {
  stepId: string;
  order: number;
  physicalWidthCm: number | null;
  mimeType?: string;
  byteSize?: number;
  checksum?: string;
  widthPx?: number | null;
  heightPx?: number | null;
  url: string;
};
export type TreasureHuntCompilationStart = {
  result: 'BROWSER_COMPILATION_REQUIRED';
  compilationId: string;
  draftRevision: number;
  compilerVersion: string;
  maxArtifactBytes: number;
  targets: TreasureHuntBrowserCompilationTarget[];
};
export type TreasureHuntCompilationStatus = {
  id: string;
  draftRevision: number;
  status: 'COMPILE_PENDING' | 'COMPILED' | 'FAILED';
  jobStatus: 'PENDING' | 'COMPILING' | 'COMPILED' | 'FAILED' | 'CANCELLED';
  artifactChecksum: string | null;
  artifactByteSize: number | null;
  compilerVersion: string | null;
  errorMessage: string | null;
  createdAt: string;
  compiledAt: string | null;
};
export type TreasureHuntPublishResult = {
  result: 'PUBLISHED' | 'ALREADY_PUBLISHED';
  version?: { id: string; version: number; publishedAt: string | null };
  draft?: { revision: number; status: string };
};
export type TreasureHuntRedemptionResult = {
  result: 'VALID' | 'ALREADY_REDEEMED' | 'EXPIRED' | 'INVALID';
  status?: 'REDEEMED' | 'ALREADY_REDEEMED' | 'EXPIRED' | 'INVALID';
  grantId?: string;
  redeemedAt?: string;
  expiresAt?: string | null;
  reward?: { name: string; displayValue: string };
};

export const treasureHuntApi = {
  list: (organizationId: string) => apiRequest<{ items: TreasureHuntSummary[] }>('/admin/treasure-hunt/campaigns', organizationId),
  get: (organizationId: string, campaignId: string) => apiRequest<{ campaign: TreasureHuntDetail }>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}`, organizationId),
  create: (organizationId: string, input: TreasureHuntDraftInput) => apiRequestWithMeta<{ draft: TreasureHuntDraft }>('/admin/treasure-hunt/campaigns', organizationId, { method: 'POST', body: JSON.stringify(input) }),
  getDraft: (organizationId: string, campaignId: string) => apiRequestWithMeta<{ draft: TreasureHuntDraft }>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}/draft`, organizationId),
  saveDraft: (organizationId: string, campaignId: string, input: TreasureHuntDraftInput, etag: string) => apiRequestWithMeta<{ draft: TreasureHuntDraft }>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}/draft`, organizationId, { method: 'PUT', headers: { 'If-Match': etag }, body: JSON.stringify(input) }),
  uploadTarget: (organizationId: string, campaignId: string, stepId: string, file: File, physicalWidthCm: number, etag: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('physicalWidthCm', String(physicalWidthCm));
    return apiRequestWithMeta<{ draft: TreasureHuntDraft }>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}/draft/steps/${encodeURIComponent(stepId)}/target`, organizationId, { method: 'POST', headers: { 'If-Match': etag }, body: form });
  },
  removeTarget: (organizationId: string, campaignId: string, stepId: string, etag: string) => apiRequestWithMeta<{ draft: TreasureHuntDraft }>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}/draft/steps/${encodeURIComponent(stepId)}/target`, organizationId, { method: 'DELETE', headers: { 'If-Match': etag } }),
  updateTargetWidth: (organizationId: string, campaignId: string, stepId: string, physicalWidthCm: number, etag: string) => apiRequestWithMeta<{ draft: TreasureHuntDraft }>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}/draft/steps/${encodeURIComponent(stepId)}/target`, organizationId, { method: 'PATCH', headers: { 'If-Match': etag }, body: JSON.stringify({ physicalWidthCm }) }),
  startCompilation: (organizationId: string, campaignId: string, etag: string) => apiRequestWithMeta<TreasureHuntCompilationStart | { draft: TreasureHuntDraft }>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}/draft/compile`, organizationId, { method: 'POST', headers: { 'If-Match': etag } }),
  uploadCompiledArtifact: (organizationId: string, campaignId: string, compilationId: string, artifact: ArrayBuffer, etag: string) => apiRequestWithMeta<{ draft: TreasureHuntDraft }>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}/draft/compile/${encodeURIComponent(compilationId)}/artifact`, organizationId, { method: 'POST', headers: { 'If-Match': etag, 'Content-Type': 'application/octet-stream' }, body: artifact }),
  getCompilation: (organizationId: string, campaignId: string, compilationId: string) => apiRequest<{ compilation: TreasureHuntCompilationStatus }>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}/draft/compile/${encodeURIComponent(compilationId)}`, organizationId),
  publish: (organizationId: string, campaignId: string, etag: string, idempotencyKey: string) => apiRequest<TreasureHuntPublishResult>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}/publish`, organizationId, { method: 'POST', headers: { 'If-Match': etag, 'Idempotency-Key': idempotencyKey } }),
  redeemReward: (organizationId: string, token: string, idempotencyKey: string) => apiRequest<TreasureHuntRedemptionResult>('/admin/treasure-hunt/rewards/redeem', organizationId, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ token }) }),
  previewTarget: (organizationId: string, campaignId: string, stepId: string) => apiDownload(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}/draft/steps/${encodeURIComponent(stepId)}/target`, organizationId),
};
