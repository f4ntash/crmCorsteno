import { apiRequest } from '../../shared/api/client';

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
};

export type TreasureHuntStep = { stepId: string; order: number; title: string; clue: string; triggerId: string };
export type TreasureHuntVersion = { id: string; version: number; name: string; description: string; progressionMode: string; publicationStatus: string; createdAt: string; publishedAt: string | null };
export type TreasureHuntReward = { rewardId: string; type: string; name: string; displayValue: string; expiresInSeconds: number | null; status: string };
export type TreasureHuntDetail = Omit<TreasureHuntSummary, 'stepCount' | 'rewardName'> & {
  description: string | null;
  progressionMode: string | null;
  steps: TreasureHuntStep[];
  triggers: Array<{ stepId: string; order: number; triggerId: string }>;
  reward: TreasureHuntReward | null;
  versions: TreasureHuntVersion[];
};

export const treasureHuntApi = {
  list: (organizationId: string) => apiRequest<{ items: TreasureHuntSummary[] }>('/admin/treasure-hunt/campaigns', organizationId),
  get: (organizationId: string, campaignId: string) => apiRequest<{ campaign: TreasureHuntDetail }>(`/admin/treasure-hunt/campaigns/${encodeURIComponent(campaignId)}`, organizationId),
};
