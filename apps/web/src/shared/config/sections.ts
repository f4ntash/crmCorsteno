import type { ConfigFieldDefinition } from './fields';

export type ConfigSectionDefinition = {
  id: string;
  title: string;
  description?: string;
  fields: ConfigFieldDefinition[];
  collapsible?: boolean;
};
