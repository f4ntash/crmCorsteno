import { createCorstenoClient } from '@corsteno/client';

const apiUrl = import.meta.env.VITE_CORSTENO_API_URL;
const siteKey = import.meta.env.VITE_CORSTENO_SITE_KEY;

export const corsteno = createCorstenoClient({ baseUrl: apiUrl, siteKey });
