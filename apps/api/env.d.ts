declare global {
  interface ImportMetaEnv { readonly PROD: boolean; readonly VITE_API_URL?: string; readonly VITE_RUNTIME_BASE_URL?: string; }
  interface ImportMeta { readonly env: ImportMetaEnv; }
}
export {};
