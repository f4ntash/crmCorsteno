export type ReportFormat = 'csv';
export type ReportScope = 'application';

export type ReportContext = {
  db: D1Database;
  organizationId: string;
  query: URLSearchParams;
};

export type ReportFile = {
  body: string;
  filename: string;
  contentType: string;
  rowCount: number;
  emptyBehavior: 'download' | 'error';
};

export type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  scope: ReportScope;
  format: ReportFormat;
  requiresApplication: boolean;
  applicationTypes?: readonly string[];
  emptyBehavior: ReportFile['emptyBehavior'];
  available: (context: ReportContext) => boolean | Promise<boolean>;
  export: (context: ReportContext) => Promise<ReportFile>;
};

export type ReportProvider = (context: ReportContext) => readonly ReportDefinition[];

export class ReportRequestError extends Error {
  constructor(
    readonly status: 400 | 404 | 422,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReportRequestError';
  }
}
