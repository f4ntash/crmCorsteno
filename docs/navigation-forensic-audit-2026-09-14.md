# Navigation Forensic Audit — 2026-09-14

Scope: CRM navigation, workspace context, route guards and organization scoping. Finder, queues, the Cosquín Rock AR repository and visual redesign are out of scope.

## Context model

The API is the source of identity and membership context:

1. `GET /auth/me` authenticates the `corsteno_session` cookie and returns `user.id`, `user.platformRole`, active memberships, membership role and derived permissions.
2. `super_admin` and `corsteno_admin` receive all active organizations as selectable viewing contexts with synthetic `global_admin` membership context. A selected organization is a viewing context; it does not replace `user.id` or `platformRole`.
3. A normal `user` receives only active memberships joined through `memberships.user_id`. `owner` is an organization role, not a Corsteno platform role.
4. Workspace product assignment is read from `experiences.type` filtered by the active `organization_id`. The canonical values are `roulette`, `website`, `ar` and `product-catalog`.
5. The web app has no localStorage/sessionStorage workspace cache, Redux, Zustand or query-cache dependency. Workspace products are cleared and reloaded on organization changes; navigation remains summary-only until the active organization’s product request completes.

Observed production admin context during browser QA:

| Field | Value |
| --- | --- |
| `user.id` | `266ac8ec-1512-4f48-b0fd-1b00c374bb12` |
| `platformRole` | `super_admin` |
| displayed identity | `Corsteno Admin` |
| displayed platform label | `Administrador de plataforma` |
| admin mode | true with no selected workspace |
| workspace mode | true after selecting an organization |

In admin mode the UI showed the internal selector placeholder `Elegí un workspace cliente`. In workspace mode it retained the same admin identity and showed `Workspace del cliente` plus the selected organization.

## Production assignment audit

Read-only query against the remote D1 database; no records were changed.

| Organization | ID | Experiences / assignment |
| --- | --- | --- |
| Corsteno | `0acb6eb9-1d42-4950-aa36-b9988637b53c` | `[TEST] Experiencia a todo ogt!` · `product-catalog` · `draft` |
| Test Matias | `ef917b2c-84fb-4e93-92fe-eb94c4501639` | `ggg` · `roulette` · `draft` |
| [TEST] BN | `9509f129-f798-4107-b665-0d027011ef84` | none; empty workspace |
| [TEST] Joseph North | `f8e5d69f-aee1-4167-b83b-7880c0931b4f` | none; empty workspace |
| aaaaaest matias | `de199534-c0bc-4197-8c3b-59a4fb1ec5bb` | none; empty workspace |
| aaaaaest matias | `cdbc144b-4b67-420d-a3a1-9a9300172ec9` | `Ruleta test matias` · `roulette` · `published` |
| est matias | `9b7e3b75-ec6b-4a16-b57a-7555686e982a` | none; empty workspace |
| est matias | `af3d947d-2500-483b-9d99-03f025b4804f` | none; empty workspace |

Production users include the platform admin above and normal users with active `admin` memberships in Test Matias, [TEST] BN, [TEST] Joseph North and the Roulette test organization. No production `website` or `ar` assignment was found, and no Cosquín Rock organization was found in this database.

`experiences.type` is a plain text column without a database CHECK constraint. The application registry now canonicalizes the four supported values, rejects unsupported types at the experience boundaries and does not perform a large schema refactor in this sprint. This is sufficient for the current assignment model, but future product provisioning would be cleaner with an explicit product-assignment relation rather than using `experiences` as both experience and product capability.

## Route inventory

These are the actual `/app/*` routes in `apps/web/src/app/LegacyCrmApp.tsx`. “Hidden/redirect” means the route is not a customer screen even if the URL is typed manually.

| Route | Admin global | Admin workspace | Roulette | Website | AR | Catalog | Product | Permission | Mode / guard |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/app` | yes | yes | yes | yes | yes | yes | none | none | admin or workspace with organization access |
| `/app/leads` | yes | redirect | redirect | redirect | redirect | redirect | none | internal operator | admin only; API also requires platform role |
| `/app/commercial` | yes | redirect | redirect | redirect | redirect | redirect | internal operator | admin only |
| `/app/subscriptions` | yes | redirect | redirect | redirect | redirect | redirect | internal operator | admin only |
| `/app/onboarding` | yes | redirect | redirect | redirect | redirect | redirect | internal operator | admin only |
| `/app/experiences` | redirect | yes | yes | yes | yes | yes | assigned canonical type | `crm.read` | workspace + product assignment |
| `/app/experiences/:id` | redirect | assigned only | assigned only | assigned only | assigned only | assigned only | assigned canonical type | `crm.read` | current organization owns the ID |
| `/app/analytics` | redirect | assigned only | yes | yes | yes | redirect | roulette/website/ar | `analytics.read` | workspace + product assignment |
| `/app/reports` | redirect | assigned only | yes | redirect | redirect | redirect | roulette | `analytics.read` | workspace + roulette |
| `/app/redeem` | redirect | assigned only | yes | redirect | redirect | redirect | roulette | `claims.redeem` | workspace + roulette |
| `/app/products` | redirect | assigned only | redirect | redirect | redirect | yes | product-catalog | `crm.read` | workspace + product-catalog |
| `/app/channels` | redirect | assigned only | redirect | yes | redirect | yes | website/product-catalog | `crm.read` | workspace + assigned channel product |
| `/app/channels/:id` | redirect | assigned only | redirect | yes | redirect | yes | website/product-catalog | `crm.read` | organization-scoped detail |
| `/app/activity` | redirect | redirect | redirect | redirect | redirect | redirect | n/a | n/a | intentionally not exposed in current sidebar |
| `/app/attention` | redirect | redirect | redirect | redirect | redirect | redirect | n/a | n/a | intentionally not exposed in current sidebar |
| `/app/assets` | redirect | redirect | redirect | redirect | redirect | redirect | n/a | n/a | intentionally not exposed in current sidebar |
| `/app/team` | redirect | redirect | redirect | redirect | redirect | redirect | n/a | n/a | intentionally not exposed in current sidebar |
| unknown `/app/*` | not found | not found | not found | not found | not found | not found | n/a | n/a | catch-all |

Every sidebar entry now declares `adminOnly`, `requiredProduct`, `requiredPermission` and `allowedMode` in `apps/web/src/app/navigation.ts`. Product items are merged by key without duplicate links; a combined workspace retains the union of its declared product capabilities.

## Visual matrix observed / supported

Admin global saw: `Inicio`, `Leads`, `Catálogo comercial`, `Suscripciones`, `Nuevo cliente`.

Admin looking at Test Matias saw: `Inicio`, `Ruleta`, `Resultados`, `Reportes`, `Canjear premio`.

Admin looking at Corsteno saw: `Inicio`, `Catálogo`, `Productos`, `Sitios y canales`.

Empty [TEST] BN saw: `Inicio` and exactly `Este workspace todavía no tiene productos configurados.`.

Website and AR have no production assignment in this database; their canonical navigation is covered by tests and the registry-only detail behavior. They are intentionally not marked as production visual PASS.

## Evidence and fixes in this audit

- The real browser session reproduced the admin/global sidebar, Leads screen, Roulette workspace, Catalog workspace, empty workspace and the exact workspace-switching sequence Admin → Roulette → Catalog → empty → Admin → Roulette.
- Manual `/app/leads` and `/app/products` deep-links while viewing Roulette were rejected back to `/app`.
- The first audit capture exposed an incorrect client-workspace breadcrumb (`CORSTENO / ADMINISTRACIÓN`) and a visible mobile aside fragment at 375 px. The minimal fix passes the active organization name to the home breadcrumb and makes the closed mobile aside non-visible/non-interactive.
- Workspace product state is now tagged to the organization that loaded it; navigation is conservative while a new organization is loading, preventing a stale product menu flash.
- The existing API Leads middleware remains: authenticated request → internal-or-organization context → platform operator check → CRM permission. A normal owner/admin membership cannot satisfy the platform-role check. Finder jobs were not created, cancelled or changed.
- Activity, analytics, channels and products remain organization-scoped at the API query boundary. Product catalog endpoints additionally require a `product-catalog` experience. The completed real-session run used temporary normal QA identities and confirmed that a customer membership, including `owner`, does not become a Corsteno platform role.

## Prior fix review

The prior working-tree changes were classified without reverting unrelated valid work:

- Necessary to navigation/context: `apps/web/src/app/LegacyCrmApp.tsx`, `apps/web/src/app/navigation.ts`, `apps/web/src/features/dashboard/OperationsHome.tsx`, `apps/web/src/features/experiences/pages/ExperiencesPage.tsx`, `apps/web/src/features/experiences/pages/ExperienceDetailPage.tsx`, `apps/web/src/features/leads/LeadsPage.tsx`, `apps/web/src/shared/api/client.ts`, `apps/web/src/styles.css`, `apps/api/src/auth/middleware.ts`, `apps/api/src/routes/leads.ts`, `apps/api/src/routes/organizations.ts`, `apps/api/src/routes/products.ts`, `apps/api/src/routes/channels.ts`, `apps/api/src/routes/catalog.ts`, `apps/api/src/services/experience-types.ts`, `packages/types/src/experience-products.ts` and their focused tests.
- Related but not navigation ownership: commercial/subscription changes, product/catalog model changes, channel content changes and their tests.
- Unrelated to this audit and intentionally preserved: Finder/Queues, runtime configuration, AR Cosquín files, favicon/assets and existing QA/scripts.
- Redundant/legacy surface found: `apps/web/src/App.tsx` still contains an older shell, but `apps/web/src/main.tsx` imports `apps/web/src/app/App.tsx`, which routes to `LegacyCrmApp`. It is not the production entrypoint and was not expanded or used as a second navigation list.

## Test status

- API full suite: 53 suites, 368 tests PASS.
- API typecheck: PASS.
- API lint: PASS.
- Web typecheck: PASS.
- Web lint: PASS.
- Web build: PASS.
- `git diff --check`: PASS.

## Post-deploy browser evidence

- The initial navigation deployment of `corsteno-crm` was `335dfe9f-430b-48af-a265-7dcf4a33c8e9`; the subsequent hydration/route-guard fix was deployed as `c3f9a359-c9e4-4160-9e05-7c3f0bbbc8b7`. API and AR runtime were not redeployed in this audit.
- Fresh production desktop capture confirmed Admin global, Catalog workspace and the exact empty-workspace message after deployment.
- Fresh production 375 px capture confirmed the mobile menu is closed and non-interactive by default, opens as an off-canvas navigation, shows the exact Roulette workspace items, and closes after navigating to Resultados.
- The post-deploy Roulette breadcrumb is the selected workspace name (`Test Matias`), not the global administration breadcrumb.
- No temporary debug logging was added. The only matching runtime log remains the pre-existing queue consumer log in `apps/api/src/index.ts`, which was outside this audit scope.

## Real session QA completion

The final production run used temporary normal QA users in existing test workspaces. Credentials were kept out of logs, source, documentation and the report, then all temporary users, sessions, fixture experiences, generated applications and fixture activity were removed.

Identity checks through the real `/auth/me` context returned:

- Roulette: `platformRole=user`, `membershipRole=owner`, organization `Test Matias`, product `roulette`.
- Catalog: `platformRole=user`, `membershipRole=admin`, organization `Corsteno`, product `product-catalog`.
- Website fixture: `platformRole=user`, `membershipRole=admin`, organization `[TEST] BN`, product `website`.
- AR fixture: `platformRole=user`, `membershipRole=admin`, organization `[TEST] Joseph North`, product `ar`.

The browser sequence `Admin → logout → Roulette → logout → Catalog → logout → Admin` passed with the expected identity and sidebar at each transition. Roulette opened Experiencias, Resultados, Reportes and Canjear premio; Catalog opened Experiencias, Productos and Sitios y canales; Website opened Web, Sitios y canales and Analytics; AR opened Experiencias, detail and Analytics. Forbidden direct URLs redirected to `/app` without rendering the unauthorized screen. Allowed refreshes preserved the current route and workspace; forbidden refreshes remained blocked. The 375 px menu showed only the current workspace's links and no cross-product items.

Website and AR were validated with temporary CRM/API fixtures because neither product had a production assignment. Both were registry-only but useful: Website exposed its experience, channels and empty analytics; AR exposed its experience detail with the explicit message that no CRM editor/configuration exists, plus empty analytics. No changes were made to the Cosquín Rock AR repository or runtime.

The final web deployment containing the hydration/route-guard fix is `c3f9a359-c9e4-4160-9e05-7c3f0bbbc8b7`. API and runtime were not modified or redeployed for this session QA.

The API regression contract in `apps/api/test/navigation-session-integration.test.ts` covers Admin → logout → Roulette → logout → Catalog, normal `user` identity, `owner` membership semantics, Leads denial and Website/AR normal identities.

Cleanup verification returned zero remaining temporary QA users, memberships, sessions, fixture experiences, generated applications, fixture activity and the known invalid test session.
