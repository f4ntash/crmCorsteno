export type AttentionSeverity = 'info' | 'warning' | 'critical';

export type AttentionItem = {
  id: string;
  organizationId: string;
  type: string;
  severity: AttentionSeverity;
  title: string;
  description?: string;
  resourceType: string;
  resourceId: string;
  actionLabel?: string;
  actionHref?: string;
  createdAt?: string | number | null;
};

export type AttentionResponse = {
  items: AttentionItem[];
  total: number;
  limit: number;
  filters?: { severity: AttentionSeverity | null; type: string | null };
};
