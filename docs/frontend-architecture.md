# Frontend architecture

`main.tsx` is the entry point and mounts `App` inside `BrowserRouter`. `App.tsx` owns the current routing tree: `/login` is public and `/app/*` is the authenticated shell. `Shell` loads `/auth/me`, redirects unauthenticated users, renders the sidebar/topbar and nested pages.

The active organization is selected from real memberships and persisted only as a convenience in local storage. The API client is `apiGet`; it always uses `credentials: include` and adds `X-Organization-Id` for tenant requests. Backend membership validation remains authoritative.

Platform navigation for Clientes is conditional on `user.platformRole` (`corsteno_admin` or `super_admin`), while `/admin/organizations` is independently protected by the backend. Current pages are Inicio, Clientes, detalle de Cliente, Proyectos, detalle de Proyecto, and placeholders for Analytics, CRM and Configuración. The shell uses flexible layout CSS and supports narrow viewports without horizontal overflow.

In local development the frontend runs on `http://localhost:5173` and the API on `http://localhost:8787`; CORS explicitly allows the configured origin and credentials so the HttpOnly session cookie can be used.
