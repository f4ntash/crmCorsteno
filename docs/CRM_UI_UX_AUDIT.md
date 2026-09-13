# Corsteno CRM — UI/UX audit

Date: 2026-09-09. Repository HEAD: `6ea6c21` plus the existing working-tree changes.

**Status: incremental audit complete for the safely reachable authenticated surfaces.**

This continuation uses the existing source audit as its baseline and adds current browser evidence for a platform-admin session and a Professional customer session. It does not repeat the source inventory or change product code. Mutation-heavy success/error paths, member/viewer sessions, and public runtime participation remain explicitly unverified.

## 1. Executive summary

Corsteno already has substantial business functionality: tenant boundaries, experience drafts, publication, inventory, participation policies, claims, commercial access, subscription entitlements, and operational analytics. The redesign should preserve these contracts and make their consequences understandable.

The strongest direction is a calm operational workspace: clear organization context, an experience-centered customer journey, compact data presentation, and one primary action per task. The CRM does not need a playful visual identity simply because its runtime is a roulette experience.

The combined evidence identifies nine P1 issues, nine P2 issues, and four P3 refinements. No P0 has been established. The added browser evidence confirms the most important shell, editor, entitlement, dialog, analytics, placeholder-route and responsive findings while leaving mutation-dependent behavior clearly marked as unverified.

The most consequential findings are fragmented draft/publication state, customer controls that disagree with backend authorization, unavailable routes in the primary navigation, CSS-only read-only controls, and missing detail-page recovery. These should be resolved as interaction design contracts before a visual reskin.

### Scope and evidence limitation

All three expected local ports were already listening: API 8787, CRM 5173, runtime 5174. The CRM login loaded at `http://localhost:5173/login`. No services were restarted, migrations run, fixtures created, or acceptance suites rerun.

The local browser session was authorized for read-only inspection. Login/session bookkeeping was allowed; no organization, experience, inventory, subscription, payment, grant, cancellation, publication or redemption mutation was performed. Runtime participation and write-dependent success states were withheld. The browser reported 1280×720 for some desktop captures despite requested larger dimensions; tablet and mobile captures were measured at 768×1024 and 390×844.

Evidence labels used below:

- **V**: current-run screenshot/DOM or keyboard observation.
- **S**: directly inspected implementation; not reproduced in an authenticated session.
- **U**: unverified state, rendering, or interaction.

### Numbered capture record

| Step | Screen/state | Viewport | General health | Evidence |
|---|---|---|---|---|
| 1 | Login, default values | 1440 × 900 | Clear form and CTA; oversized title, developer defaults | [Desktop](crm-ui-ux-audit/01-login-desktop.jpg) |
| 2 | Login, mobile | 390 × 844 | Fits viewport; measured document width 390px, no horizontal overflow | [Mobile](crm-ui-ux-audit/02-login-mobile.jpg) |
| 3 | Login, laptop | 1366 × 768 | Form fits; abundant unused space | [Laptop](crm-ui-ux-audit/03-login-laptop.jpg) |
| 4 | Login, tablet | 768 × 1024 | Form fits; large surrounding space | [Tablet](crm-ui-ux-audit/04-login-tablet.jpg) |
| 5 | Login keyboard | Tablet viewport | Tab from Email reaches password; visible 2px focus outline | DOM observation; no separate screenshot |
| 6 | Admin/customer authenticated journeys | 1280×720 desktop; 768×1024 tablet; 390×844 mobile | Read-only browser inspection completed for platform admin and Professional customer | [Authenticated evidence set](#authenticated-browser-evidence) |

All four screenshot files were reopened and inspected. The files retain the browser's returned JPEG image bytes. No screenshot was generated from source or substituted with a mockup.

![Login desktop](crm-ui-ux-audit/01-login-desktop.jpg)

![Login mobile](crm-ui-ux-audit/02-login-mobile.jpg)

![Login laptop](crm-ui-ux-audit/03-login-laptop.jpg)

![Login tablet](crm-ui-ux-audit/04-login-tablet.jpg)

## Authenticated browser evidence

The following captures are current local-browser evidence, not mockups. The platform-admin session covered Home, experiences, creation, the experience editor, QR, inventory adjustment, onboarding, commercial plans, plan editing, subscriptions and subscription creation. The Professional customer session covered Home, experiences, the same detail/editor surface, analytics loading and loaded states, placeholder routes, and redemption. The screenshots are intentionally read-only; no button that creates, publishes, adjusts, bills, grants, cancels or redeems was submitted.

| Role | Viewports | Confirmed surfaces | Evidence |
|---|---|---|---|
| Platform admin | Desktop browser (reported 1280×720/1440×900 depending capture) | Home, experience list, create dialog, editor, QR dialog, stock card, onboarding, commercial catalog/editor, subscriptions, subscription dialog | [Home](crm-ui-ux-audit/05-admin-home-desktop.jpg), [experiences](crm-ui-ux-audit/06-admin-experiences-desktop.jpg), [create](crm-ui-ux-audit/07-admin-create-dialog.jpg), [editor](crm-ui-ux-audit/08-admin-editor-desktop.jpg), [QR](crm-ui-ux-audit/09-admin-qr-desktop.jpg), [stock](crm-ui-ux-audit/10-admin-stock-dialog.jpg), [onboarding](crm-ui-ux-audit/11-admin-onboarding.jpg), [plans](crm-ui-ux-audit/12-admin-plans.jpg), [plan editor](crm-ui-ux-audit/13-admin-plan-editor.jpg), [subscriptions](crm-ui-ux-audit/14-admin-subscriptions.jpg), [subscription dialog](crm-ui-ux-audit/15-admin-subscription-dialog.jpg) |
| Professional customer | 1280×720 desktop, 768×1024 tablet, 390×844 mobile | Home, experience list/detail/editor, analytics loading/loaded, placeholder routes, redemption | [Home](crm-ui-ux-audit/16-customer-home-desktop.jpg), [experiences](crm-ui-ux-audit/17-customer-experiences-desktop.jpg), [editor](crm-ui-ux-audit/18-customer-editor-desktop.jpg), [mobile editor](crm-ui-ux-audit/19-customer-editor-mobile.jpg), [analytics tablet](crm-ui-ux-audit/20-customer-analytics-tablet.jpg), [analytics mobile loading](crm-ui-ux-audit/21-customer-analytics-mobile.jpg), [analytics loaded](crm-ui-ux-audit/22-customer-analytics-mobile-loaded.jpg), [placeholder loading](crm-ui-ux-audit/23-customer-placeholder.jpg), [placeholder](crm-ui-ux-audit/24-customer-placeholder-loaded.jpg), [redemption](crm-ui-ux-audit/25-customer-redeem-mobile.jpg) |

The browser evidence confirms that the editor is a single long operational page (about 4,100px desktop and 5,534px mobile), that customer-facing duplicate/access controls remain visible beside disabled entitlement controls, that QR/create dialogs do not contain focus, that stock adjustment is styled as an in-page card rather than an overlay, that analytics exposes raw event keys, and that Proyectos/CRM/Configuración resolve to “Próximamente.”

## 2. Product/user model

### Actual architecture

The pnpm workspace contains `apps/web` (React 19, Vite, React Router), `apps/api` (Hono on Cloudflare Workers, D1/SQLite, Drizzle schema/migrations), `apps/runtime`, and shared types, analytics client, and roulette renderer packages. Recharts supplies CRM charts; QRCode supplies QR assets. R2 stores experience assets.

The active import chain is **`apps/web/src/main.tsx` → `app/App.tsx` → `app/LegacyCrmApp.tsx` → feature pages**. The separate large `apps/web/src/App.tsx` is not imported by that entry chain. It has existing user changes and duplicate implementations. Do not base a redesign or route-completeness judgment on its contents alone. The architecture README also describes earlier functionality; current routing source is more specific evidence.

`shared/api/client.ts` centralizes credentials and `X-Organization-Id`. Auth uses HttpOnly cookies. Platform role and organization membership role are separate concepts; the backend remains authoritative. The active shell selects the first returned organization on mount and holds it in component state.

Organizations contain memberships, projects, applications and experiences. Applications connect runtime activity to analytics; experience publication ensures an analytics application mapping. Experiences have a persisted status, effective scheduling status, draft configuration, published configuration, and separately evaluated commercial access. None should be collapsed into a single editable boolean.

### Users and intended jobs

| User | Intended work / current restrictions |
|---|---|
| Platform admin: `super_admin`, `corsteno_admin` | Choose a customer context; create customers and experiences; manage global catalog, subscriptions, grants/access; support campaign operations. Backend grants global organization access. |
| Customer owner/admin | Operate existing experiences: configuration, publishing, inventory, redemption where authorized and entitled. They do not gain platform commercial powers from `crm.manage`. |
| Customer member | `crm.read`, without `crm.manage`; inspect experiences/results rather than modify them. |
| Customer viewer | Lower role than member. Does not receive `crm.read` in the current permission map; do not assume all customer routes should be available. Analytics currently uses authenticated organization middleware rather than the CRM permission gate. |
| Public participant | Opens `/r/:slug`, participates under server-enforced rules, may receive a claim code. This runtime is separate from the CRM's business interface. |

The API exposes organizations/admin, projects/applications, event ingestion, analytics, experiences/assets/public runtime, commercial, and payment webhook routes. Preserve tenant filtering at every level.

### Commercial invariants

`packages/types/src/commercial.ts` defines Starter/Professional/Enterprise. Current capacities are 1/3/unbounded respectively. Starter includes core roulette, 3D, result CTA, inventory, participation limits and basic analytics; higher plans add AR, branding, claims, advanced analytics and premium effects. Subscriptions snapshot entitlements; legacy access has explicit fallback semantics in `services/commercial-entitlements.ts`. Prices and sale availability are database-backed; feature definitions are code-backed. This audit proposes **no changes** to any of these rules, renewal periods, monetary units, or payment flows.

## 3. Screen inventory

Paths below are relative to `apps/web/src` unless stated otherwise. Authenticated rows now combine S with the browser evidence listed above; write-dependent states remain U.

| Route/surface | Purpose and current implementation | Inspection / relevant states |
|---|---|---|
| `/login` | `features/auth/pages/LoginPage.tsx` | V at four widths; keyboard focus. Success/error submission U. |
| `/app` | `features/dashboard/DashboardPages.tsx::Home` | V/S: app preview, app selector, organization-wide 24h summary, project link, empty/error/loading branches. |
| Global shell | `app/LegacyCrmApp.tsx::Shell` | V/S: sidebar, organization select, identity/logout; admin-only links and redeem gate. |
| `/app/projects` | No dedicated route in active shell; wildcard placeholder | S: visible sidebar destination. |
| `/app/projects/:id` | Home links here; wildcard placeholder | S: no project detail component mounted. |
| `/app/analytics` | `DashboardPages.tsx::Analytics` | V/S: date/project/application filters, type-specific metrics, ranks, charts, empty/loading/error. |
| `/app/experiences` | `features/experiences/pages/ExperiencesPage.tsx` | V/S: cards/status/dates, creation/template modal; customer cannot create here. |
| `/app/experiences/:id` | `ExperienceDetailPage.tsx` | V/S: duplicate, publish, commercial access, QR, editor, spins and claims in one flow. |
| Roulette settings/design | `features/roulette/components/RouletteEditor.tsx` | S: background, effects, CTA, preview, segments. |
| Prize configuration | `RouletteEditor.tsx::PrizeEditor` | S: name, weight, stock mode/initial stock, active, redemption, icon upload. |
| Participation | `ParticipationControls.tsx` | S: per-device, per-session, cooldown; local form values only until draft save. |
| Inventory operations | `RouletteEditor.tsx` | S: delivered/available, add/remove stock, confirmation dialog. Mutation U. |
| Publishing | `features/experiences/components/PublishControls.tsx` | S: independent draft/publication snapshot, native confirmation, success/error messages. |
| QR/runtime link | `ExperienceQrModal.tsx` | S: generated QR, link, dismiss backdrop; runtime UI U. |
| Commercial access | `AccessPeriodPanel.tsx` | S: history, add period, +7/+30/+90 days. No periods modified. |
| Spin history | `SpinHistory.tsx` | S: result/prize/date filters, 25-row pagination, scroll container. |
| Claim lookup | `ClaimsPanel.tsx` | S: code search and redeem existing result; no general claim list in this component. |
| `/app/redeem` | `features/claims/pages/RedeemPage.tsx` | V/S: code form, direct validate-and-redeem, status/alert feedback; submit was not invoked. |
| `/app/onboarding` | `ClientOnboardingPage.tsx` | S: six conditional steps. Later steps require actual writes, so U visually even if session access is authorized. |
| `/app/commercial` | `CommercialPage.tsx` | S: global plan cards, inline price/availability editor. |
| `/app/subscriptions` | `SubscriptionsPage.tsx` | S: creation modal, capabilities, periods, payments, external payment/grant prompts, cancellation confirm. |
| `/app/crm`, `/app/settings` | Wildcard “Próximamente” | S: visible destinations without dedicated screens. |
| Admin/customer directory | API `/admin/organizations` and detail exist | S: no directory/detail route mounted by active shell. Do not count API endpoints as CRM screens. |
| Unknown `/app/*` | Same “Próximamente” wildcard | S: missing routes and planned sections indistinguishable. |
| Root/unknown outer route | Redirect to `/app`; unauthenticated shell redirects to login | S only. |

Coverage still needed: member/viewer distinctions using existing fixtures, 1440×900 and 1366×768 authenticated captures where the browser caps desktop size, mutation-dependent success/error states, full dropdown traversal, and public runtime participation. Server-written success states were intentionally not reproduced.

## 4. Global UX findings

- **F01 / P1:** Draft save and publish have independent state. The browser confirms separate “Guardar borrador” and “Publicado/Publicar” controls on the editor, but no mutation was submitted, so refresh/notification parity remains U. Preserve separate mutations while unifying their presentation and refreshing from successful saves. S/V/U.
- **F02 / P1:** Customer affordances disagree with backend policy. The customer editor visibly exposes duplicate and commercial-access actions even though clone/access-period POSTs are platform-only; redemption entitlement is shown disabled. Preserve backend gates and derive the presentation from the same capability source. S/V.
- **F03 / P1:** Primary navigation advertises Proyectos, CRM and Configuración without implemented destinations; the browser reaches the generic “Próximamente” page for these paths and the Home project link. Hide planned destinations from primary navigation or distinguish them clearly from useful screens. S/V.
- **F04 / P1:** Detail loading/error resolves to `null`; an unavailable experience gives no title, explanation, retry or return action. Inventory errors become `[]` and can then look like zero available/delivered. This failure path was not forced in the read-only run; treat the source risk as U and unknown data as unavailable. S/U.

Strengths worth preserving: Spanish task labels, explicit stock persistence explanation, independent draft publication, creation error retry in the list, meaningful access status labels, and typed feature contracts.

## 5. Navigation findings

The browser shows a visible active item, but the shell still provides no breadcrumbs and mixes destinations with platform tasks such as “Nuevo cliente.” All roles share Inicio/Proyectos/Analytics/Experiencias/CRM/Configuración while platform actions are interleaved. **F09 / P2** covers orientation and grouping; the source-only claim that active styling is entirely absent is not retained.

Put the current organization next to the page context, label the selector, and visibly separate platform scope from organization scope. A change of organization must clear incompatible entity selection and dirty state only through a deliberate interaction. Do not remove backend checks because navigation hides something.

## 6. Visual design findings

The observed login is restrained and readable, with a clear primary button. It already avoids neon and excessive decoration. Desktop heading sizing reaches 58px (`styles.css`), disproportionate to a two-field business form. The same global heading rule applies broadly. **F10 / P2:** reduce the type scale for working pages and constrain spacing by task density.

**F11 / P2:** shared grid styling is applied to incompatible structures. `.experience-card` defines four desktop columns but is reused for list rows, plan/subscription articles, onboarding sections and the redemption form. The browser confirms the resulting density in onboarding, plans and the long editor. Replace the shared layout assumption with a neutral surface plus explicit row/form layouts.

**F12 / P2:** the stylesheet search found no definitions for `publish-control`, `prize-editor`, `inventory-row`, `adjust-modal`, `access-period-form` or `claim-search`. They inherit basic browser/global styling. `textarea` is also omitted from the font/control normalization. Review these rendered surfaces first; do not assume every missing selector is intrinsically a bug.

Current radii are largely 6/8/10px plus pill badges, which is a usable starting point. Colors and spacing are repeated literal values; do not add a new palette per feature. Background and text defaults are coherent; muted labels, disabled controls, outlines, and chart axes need measured contrast in actual states.

## 7. Button/action findings

**F13 / P2:** many operations use the same bright `button:not(.link)` base style, with secondary overrides using `!important`. The browser confirms four equal-weight subscription actions and several editor actions competing above the fold. Publication and commercial actions need stronger hierarchy and a contextual menu for infrequent operations.

| Major screen | Primary | Secondary | Tertiary/contextual | Destructive/consequential handling |
|---|---|---|---|---|
| Login | Ingresar | None required | Help/recovery only if supported | Prevent repeated submit while pending |
| Home | Open relevant experience | Ver resultados | Change app/context | No destructive action |
| Experience list | Nueva experiencia, platform only | Open row | Template in creation flow | Do not add delete without an actual authorized flow |
| Experience detail | Guardar borrador when dirty | Publicar saved changes | QR/public link; duplicate in menu | Publishing needs explicit saved-version summary |
| Design | Shared draft save | Preview toggle | Advanced effects/CTA disclosure | Leaving unsaved edits needs a guard |
| Prizes | Shared draft save | Add prize | Edit details per row | Separate draft changes from live stock operations |
| Inventory | Adjust stock in selected row | Cancel adjustment | Show current balance/history | One signed adjustment dialog, preview before/after, same endpoint semantics |
| Participation | Shared draft save | Reset field if explicitly supported | Unit explanation | Preserve null/zero and limit bounds |
| Spin history | No filled CTA needed | Filters | Previous/next as quiet controls | No mutation |
| Claim search | Buscar | Canjear after valid lookup | Claim details | Bind confirm/result to exact current code |
| Standalone redemption | Validar y canjear | None currently | Clear input | Show that submit immediately consumes claim; pending lock |
| Onboarding | One action for current step | Back/resume if safely supported | Advanced editor | Explain persistence before each creating step |
| Plans | Edit selected plan | Save/cancel inside editor | Feature details | Scope warning for global catalog; no commercial rule changes |
| Subscriptions | Create at page level | Open subscription details | Payment, courtesy, renewal in contextual menu | Cancellation separated; preserve end-of-period behavior |
| Commercial access | Add/extend inside disclosure | Cancel | History | Collapse +7/+30/+90 into one extension control; preserve durations |
| Placeholder sections | Return to available work | None | None | Do not invent functionality |

“Fewer clear actions > many visible buttons” is the governing principle. Menus should consolidate infrequent actions, never conceal the primary operational task.

## 8. Form findings

**F05 / P1:** dirty draft state has no navigation protection in the inspected active feature path. `Volver`, sidebar links, organization switching or refresh can discard local work. Add a shared navigation contract before splitting the editor into views. Keep unsaved state distinct from unpublished state. S.

**F14 / P2:** validation and feedback vary by feature. Login has no busy/disabled submit state. Redemption similarly lacks a pending lock. Editor `isValidRouletteDraft` validates some fields while server validation also checks weight, stock and CTA URL constraints; the editor is not a native form submission that automatically enforces all input limits. Field errors need actionable labels and an error summary, with server authority retained.

Use inline explanations for blank = unlimited, cooldown zero, eligible integer ranges, initial stock versus operational balance, and time zone. Preserve draft values after rejection. Do not silently clamp a customer's input without explaining the result. Use a meaningful label for prize name and each segment selector/color input.

Onboarding's first step creates organization and user sequentially. Later steps require experience/subscription/publication writes. It is not just a reversible six-screen wizard. **F15 / P2:** communicate what each step creates, current completion and recovery after partial success; avoid “hash,” “local,” and fixture examples in normal customer-facing copy. Any resume behavior that requires backend changes is a separate scoped change.

## 9. Table/data findings

The experience list uses cards with two status badges and date metadata, but no search/sort/pagination in the active component. Prefer a compact list/table with name, publication state, access state, schedule and contextual action; only add filtering when fixture volume demonstrates the need.

The spin table has a deliberate horizontal scroll container and 680px minimum row width. That is a sound containment idea, but `role=table`/`role=row` wrap plain spans without cells or columnheaders. **F16 / P2:** use native table semantics, preserve filter and 25-row pagination behavior, and provide discoverable access to full IDs beyond hover-only title text.

Claims and inventory should show unknown/loading data explicitly. A claim search that finds nothing should not resemble a redeemed/expired claim. Current spin empty text does not distinguish no history from no matches for active filters. Monetary data must continue using minor-unit conversion and the existing currency contract.

## 10. Responsive findings

Confirmed V: login fits all four requested width classes. Authenticated customer evidence adds 768×1024 and 390×844: the editor has no document-level horizontal overflow, but reaches roughly 5,534px on mobile; analytics reaches roughly 2,189px and its filters remain usable. Desktop browser sizing capped some captures at 1280×720, so 1440×900 and 1366×768 authenticated claims remain U.

Remaining source-derived test priorities, not confirmed overflow defects:

| Width | Important checks |
|---|---|
| 1440 desktop | Editor hierarchy and scroll depth; title/action balance; commercial form use of available width |
| 1366 laptop | 248px sidebar + 88px page padding reduce usable content; editor keeps a 360px preview minimum above 800px |
| 768 tablet | Sidebar remains 190px under 760px only; editor switches to single column at 800px; preview moves before controls |
| 390 mobile | Navigation becomes a three-column grid rather than a drawer; header wraps; onboarding/subscription content stacks; action rows lack wrapping rules |

`.modal` has width constraints but no explicit maximum viewport height or overflow scrolling. The browser confirms QR/create dialogs lack focus containment, while stock adjustment is presented as an in-page card rather than a modal overlay. The preview has a 390px minimum height and is moved above controls at narrow widths.

Recommended layout: persistent desktop navigation, compact labeled tablet navigation, mobile drawer, wrapped page actions, full-width form controls, contained table overflow, dialog scrolling, and preview disclosure on small screens. Preserve all permitted operations across widths.

## 11. Accessibility findings

Confirmed V: login has wrapping labels; Tab from Email moved to password; focus outline was `2px solid rgb(127,168,207)`. In authenticated evidence, QR and creation dialogs did not close on Escape or contain Tab focus, and focus did not return predictably; the stock “dialog” is visually an in-page card. Screen reader, zoom, autofill and member/viewer keyboard journeys remain U.

**F06 / P1:** read-only editor uses `.permission-readonly ... { pointer-events:none; opacity:.72 }` and `aria-readonly` on a div. The customer evidence confirms entitlement-dependent controls can appear disabled while other capability-sensitive actions remain visible. Member keyboard editing/submission was not attempted; keep the source risk U for that role. Replace with real disabled/read-only controls or a dedicated display mode while retaining backend gates.

**F07 / P1:** custom dialogs lack a shared focus trap/Escape/return-focus mechanism in inspected code. Browser checks confirm QR and creation dialogs remain open on Escape and allow Tab to leave the dialog; creation/stock dialogs also lack a reliable accessible name or overlay treatment. Introduce one accessible dialog primitive, not four independent overlays.

Other baseline work: label the organization select, prize-name inputs and segment controls; correct table semantics (F16); associate hints/errors; announce asynchronous outcomes; keep status text alongside color; include `textarea` in focus styling. Measure contrast against actual backgrounds before claiming any WCAG failure or compliance.

## 12. Experience editor deep dive

Current browser order is duplicate → publication → full commercial access/history/editing → QR → title/back → configuration + preview → inventory → spin history → claim lookup. On mobile this becomes a roughly 5,534px page before the user reaches all operational sections. The experience's own title is preceded by unrelated operational controls. Design choices, commercial administration and live redemption compete in the same document.

Recommended structure:

1. A stable experience header with breadcrumb, name, publication state, access summary and draft-save state. Show the customer's actual capabilities here.
2. **Overview:** current availability, link/QR and a compact results summary. Commercial access is a summary with authorized details, not an always-open edit form.
3. **Configuration:** grouped Design, Prizes and Participation sections with an in-page outline. Use local disclosure first; do not create seven tabs by default. Preserve one draft across all groups and show save status persistently.
4. **Results:** spins and claim lookup, with filter context. Live inventory operations belong alongside the prize list but must be explicitly distinguished from draft editing.
5. Publication opens a compact review of the saved draft and access/schedule status. QR indicates whether the current public link is usable. Duplicate belongs in the experience menu.

Use route-level subviews only for major modes when testing shows the long document is unwieldy; tab appearance alone does not solve state ownership. Unsaved changes must survive local section switches. The renderer remains a preview; do not change winner selection, weight logic, stock consumption or runtime effects while changing its container.

High-risk contracts: F01/F02/F04/F05/F06/F07, draft normalization and schema version, stable prize/segment IDs, initial-stock semantics, icon upload persistence, entitlement gating, publish-time inventory synchronization, and read-only mode.

## 13. Analytics deep dive

The screen already supports useful date/project/application scope, separate roulette operational totals and events, prize distribution, blocking reasons, AR activity and time series. These are valuable capabilities to retain.

**F08 / P1:** Home's selected application changes the app card, but its metrics are loaded only by organization. The browser confirms the selected app and 24h metrics coexist without an explicit scope label. Labels visually imply a selected-app summary while numbers remain organization-wide. Make scope explicit and maintain existing metric definitions; adding app-scoped requests is an explicit, tested presentation change.

The dedicated Analytics screen renders four general KPIs, another eight roulette KPIs when a roulette application is explicitly selected, then ranks and charts. The loaded mobile browser view confirms the long KPI stack and raw event keys such as `roulette_spin_blocked`; the selection logic also means an all-app view for a roulette-only organization does not reveal the roulette-specific block until an application is selected. Prefer a concise primary row with participation/completion, prize outcomes and claims, and secondary technical metrics below. The exact ordering should be validated with real customer data.

“Premios entregados” currently represents `roulettePrizesWon`, while actual claim redemption is separate. **F17 / P2:** distinguish awarded prizes from physically redeemed claims; explain conversion denominator, period and application scope. Label AR metrics in business language without changing event keys. Translate blocking reasons for display, retaining raw codes for diagnostics when useful.

Do not change the API's authoritative operational SQL, event fallback, distinct-user/session semantics, claim time attribution, or conversion formulas. Error recovery currently replaces the entire analytics screen with a generic error, preventing filter recovery; retain filters and offer retry. Separate true zero, no observations and failed fetch. Loading currently uses text rather than stable-height placeholders.

## 14. Admin/customer distinction

Keep platform-only catalog, subscription, onboarding and organization administration separate from customer campaign operations. The active shell correctly hides several platform routes; preserve those checks.

F02 is the key inconsistency: `crm.manage` is insufficient for duplicating or extending commercial access, and subscription lookup is not a customer-safe capability source. Do not “fix” the mismatch by granting access to commercial endpoints. Future UI work should consume only an authorized capability representation already available or separately approved, with explicit errors rather than silently reporting no entitlement.

The member read-only experience must actually behave read-only. Viewer is a different level and may not read CRM experiences at all. This pass tested platform admin and Professional customer only; member/viewer behavior remains a required follow-up.

## 15. Design-system/code findings

Preserve the existing feature boundaries, `apiRequest`, experience API functions, roulette draft hook, shared commercial types, preview wrapper, and specialized Participation/SpinHistory/Claims/QR components. They are useful domain seams even where their markup needs work.

The active shell and the separate monolithic `src/App.tsx` duplicate substantial product UI. Before redesign work, freeze an explicit entry-point map and characterize the active behavior. Avoid simultaneously consolidating legacy code and redesigning stateful features.

Global element selectors (`header`, `form`, `label`, `input`, `button`) create broad coupling. `form { max-width:390px }` and `.experience-card` layout assumptions leak between features. Colors, spacing and button styles are literal/repeated rather than tokenized. CSS is mostly compressed single-line rules, making responsive ownership difficult to inspect. These support F10–F13, not an independent severity count.

Use a small design system that solves observed repetition. Do not introduce a generalized schema-driven CRUD platform or duplicate the API/domain layer to obtain consistent buttons.

## 16. P0 issues

**Count: 0 established.** No critical broken interaction has been demonstrated in the current browser run. Mutation-dependent and member/viewer paths remain outside this count. The previous functional acceptance is user-provided context, not a test result reproduced here.

## 17. P1 issues

**Count: 9 combined source/browser findings.**

| ID | Issue | Source | Required verification / regression boundary |
|---|---|---|---|
| F01 | Save/publication state can diverge | `PublishControls`, `RouletteEditor` | V controls; mutation/refresh parity remains U |
| F02 | Customer capability presentation contradicts backend gates | `ExperienceDetailPage`, API commercial/experience routes | V customer/admin contrast; preserve entitlements and permissions |
| F03 | Primary links resolve to generic planned-page route | `LegacyCrmApp`, `Home` | V placeholder pages for project/CRM/settings |
| F04 | Blank experience failure / unknown inventory presented as empty | `ExperienceDetailPage`, `RouletteEditor` | Missing entity and inventory error remain U |
| F05 | Unsaved changes unprotected during navigation | `RouletteEditor`, `useRouletteDraft`, shell | Mutation/navigation journey remains U |
| F06 | Read-only is pointer-only, keyboard controls remain live | `RouletteEditor`, `permission.css` | Customer entitlement display V; member keyboard journey U |
| F07 | Dialog interaction/accessibility lacks consistent implementation | QR, create/subscription modal, stock adjustment | V Escape/focus/overlay failures |
| F08 | Home's selected application and metric scope differ | `DashboardPages::Home` | V selected app plus organization-wide metrics |
| F22 | Experience detail buries the primary object and operations | `ExperienceDetailPage`, `RouletteEditor` | V 4,100px desktop/5,534px mobile page; preserve all domain sections |

## 18. P2 issues

**Count: 9.** IDs are unique; section discussions do not add new findings.

| ID | Issue | Evidence | Recommendation / risk |
|---|---|---|---|
| F09 | Missing active navigation/breadcrumbs and scope grouping | V/S | Shared shell orientation; preserve route permissions |
| F10 | Oversized headings and inconsistent task density | V login/home; S global CSS | Modest type/spacing scale; verify long names/mobile |
| F11 | One card grid reused across unrelated forms and records | V/S | Separate surface from layout; preserve form association |
| F12 | Operational component styles absent; textarea unnormalized | V/S | Style real primitives after screenshots; avoid global overrides |
| F13 | Too many equal-weight actions; disabled appearance weak | V/S | One CTA, contextual menus; retain access to permitted actions |
| F14 | Uneven validation, pending locks and error recovery | S; V loading states | Field errors and busy states; no domain validation changes |
| F15 | Onboarding persistence/progress and implementation-heavy copy | V/S | Explain step outcome and partial completion; no writes in audit |
| F16 | Table structure/ID access and filtered empty-state clarity | S; V spin/results area | Native table and useful empty states; preserve pagination/query scope |
| F17 | Analytics labels obscure meaning/scope | V/S | Awarded versus redeemed, definition help; no metric redefinition |

## 19. P3 polish

**Count: 4.**

- **F18:** Standardize Spanish product language: “application,” “Claims,” “ENTITLEMENT,” “Preview” and implementation details should not compete with business task labels. Retain actual API names in code.
- **F19:** Tighten sign-in presentation: clear demonstration defaults from normal login, add autocomplete metadata, reduce heading, and only expose recovery/help routes that really exist. V/S; no claim that default credentials work.
- **F20:** Standardize icon/chevron usage and quiet link treatment; replace ad hoc arrows with one icon set only where useful. Preserve accessible names.
- **F21:** Add concise result feedback, stable-height loading placeholders and consistent dates/time-zone help. Avoid animation that distracts from operations. This complements F14's functional recovery rather than adding a new error state contract.

**F22 / P1:** Experience detail is an operational mega-page. The browser measured about 4,100px desktop and 5,534px at 390px wide, with commercial access and publication controls preceding the experience title. Split the information architecture into overview, configuration and results while preserving one draft, inventory semantics, claims, spin history and publication contracts.

### Browser-informed validation matrix

| Finding | Current status | Evidence / boundary |
|---|---|---|
| F01 | Partially confirmed | Separate draft/publication controls visible; save/publish refresh untested |
| F02 | Confirmed | Customer duplicate/access controls visible beside disabled entitlement; backend gate preserved |
| F03 | Confirmed | Project/CRM/settings resolve to “Próximamente” |
| F04 | Unverified | No forced missing-entity or inventory-error response |
| F05 | Unverified | No local draft mutation/navigation attempt |
| F06 | Partially confirmed | Capability-sensitive controls visible/disabled; member keyboard path untested |
| F07 | Confirmed | QR/create dialogs fail Escape/focus containment; stock card is not an overlay |
| F08 | Confirmed | Selected app shown with organization-wide Home metrics |
| F09–F13 | Confirmed or partially confirmed | Shell, heading, shared-card, primitive-style and action-density issues visible in captures |
| F14–F16 | Partially confirmed | Loading/onboarding/table surfaces visible; error and filtered-empty states unforced |
| F17 | Confirmed | Analytics shows raw event keys and separate awarded/claim concepts |
| F18 | Confirmed | Mixed English/Spanish labels visible across admin/customer screens |
| F19–F21 | Partially confirmed | Login/loading/feedback concerns remain; autofill, icon consistency and all async branches need follow-up |
| F22 | Confirmed | Long desktop/mobile editor and overloaded hierarchy visible |

## 20. Recommended redesign direction

**A calm campaign operations workspace.** Use restrained dark slate surfaces consistent with the current product, with a clear neutral hierarchy and one muted blue accent. Bright runtime colors stay inside the preview. Avoid gradients in the shell, glass panels, glowing badges, animated dashboards and decorative phone mockups as the dominant business content.

- Typography: one system/Inter-compatible family; approximately 14px body, 12–13px supporting labels, 20px section and 28–32px page titles. Keep readable line height and sentence case. Values are prominent only when they aid a decision.
- Layout/density: stable shell, compact header, broad workspace; single-column readable forms, full-width data when needed. Content, not decorative cards, defines page length.
- Spacing: practical 4/8/12/16/24/32 scale; consistent page gutters, aligned field labels and action rows. Do not preserve every arbitrary existing padding.
- Cards: use borders for meaningful groups, not a separate large card around every fact. Preview, editing and operational data have distinct surfaces.
- Tables: compact rows, clear headers, selected context and useful empty states. Local horizontal scrolling only for truly tabular data.
- Forms: visible labels, nearby help, validation at the field, explicit save scope. Existing server validation remains the source of truth.
- Buttons: one primary per task, secondary for alternatives, text links for navigation, menus for infrequent operations, separated destructive actions.
- Color: neutral structure; semantic success/warning/error with text. Do not use status colors as decoration. Verify contrast when tokens are chosen.
- Responsive: adapt shell and disclosure, not just stack every card. Preview is optional on small screens; critical operational controls remain reachable.
- Interaction: predictable feedback, no surprising persistence, explicit commercial scope, keyboard-complete dialogs and safe dirty-state transitions.

## 21. Proposed information architecture

| Scope | Destinations | Notes |
|---|---|---|
| Customer workspace | Overview, Experiences, Results, Redemption when permitted | Experiences are the main customer object. “Results” may retain `/app/analytics` while label changes. |
| Within an experience | Overview, Configuration, Results | Prizes/Participation are configuration groups; claims and spins are results/operations. Test before making each a separate tab. |
| Platform administration | Customers/activation, Commercial catalog, Subscriptions | Distinguish global catalog from current-customer subscription scope. Customer directory is a future screen if still absent, not a hidden existing implementation. |
| Utility | Organization selector, account/logout | Visible scope label; no mixed tenant identity. |
| Planned features | Projects/CRM/Settings only when useful screens exist | Do not ship dead primary links as if complete. Keep intentional permissions. |

Maintain existing deep links through redirects if route structure changes. Do not invent a new customer billing portal or widen access as part of navigation cleanup.

## 22. Proposed component/design system

| Small shared primitive | Concrete reuse |
|---|---|
| Button / IconButton | Pending, disabled, primary/secondary/quiet/danger; named icon actions |
| FormField + Input/Select/Textarea/Checkbox | Labels, help, validation and native semantics; input types remain explicit |
| PageHeader / Section / Surface | Page title/actions and content grouping without baked-in data grids |
| StatusBadge / Alert / LoadingState / EmptyState | Distinguish publication, access, failure, no results and true zero |
| Table | Experience/spin data; native structure and contained overflow |
| Dialog | Creation, QR and stock with one focus/scroll/Escape implementation |
| DropdownMenu | Duplicate and infrequent subscription actions; role-filtered items |
| LocalSectionNavigation | Configuration outline; use Tabs only if actual modes warrant it |

Do not abstract domain components such as prize weights, subscription renewal or draft normalization into generic UI primitives. Keep layout tokens out of business configuration and keep business defaults out of visual components.

## 23. Implementation phases

These phases are a proposal only. No implementation is authorized by this audit.

| Phase | Files/areas likely touched | UX goal | Regression risk | Acceptance checks |
|---|---|---|---|---|
| 0 — Complete evidence and freeze behavior | Browser evidence, role matrix, state transitions, active import map | Resolve coverage gaps; identify intentional placeholders; establish read-only baseline | Testing a write path can alter fixtures or entitlements | Numbered screenshots, role/viewport matrix, explicit U states |
| 1 — Shell and primitives | `LegacyCrmApp`, CSS tokens, nav, fields, buttons, dialog primitive | Clear scope, density and keyboard-complete overlays | Global selectors can change every feature | Four-width shell checks; active route and dialog semantics; tenant/permission behavior unchanged |
| 2 — Core customer operations | Home, experiences list, redemption pages | Scope labels, useful routes, no false-zero/error ambiguity, safe redemption pending state | Home/analytics scope drift; claim double-submit | API request snapshots, empty/error/forbidden states, redemption rejection and retry |
| 3 — Experience editor | `ExperienceDetailPage`, `RouletteEditor`, publish/access/inventory/results sections | Overview/configuration/results hierarchy; one visible draft state | Dirty state, stock, claims and publication can desynchronize | Dirty navigation guard, save/publish parity, inventory and claim invariants |
| 4 — Analytics and platform operations | Analytics, onboarding, commercial catalog, subscriptions | Business-readable metrics and platform/customer separation | Commercial arithmetic, renewal, entitlement and onboarding retries | Exact metric/filter requests, role matrix, no billing-rule changes |
| 5 — Consolidated quality pass | Responsive, contrast, keyboard, long/empty/error/loading states | Consistent operation at every supported width | Late global style regressions and role leakage | All acceptance criteria below pass; no document overflow or inaccessible modal |

Responsive and accessibility checks run in every phase; phase 5 is the final integration pass. Keep each PR small and avoid simultaneously replacing the router, data layer and editor state ownership.

## 24. High-risk regression areas

| Area | Why risky | Required preservation |
|---|---|---|
| Experience detail/editor | Multiple independent requests, permissions and local draft state | Exact schema/prize IDs, dirty state, organization/entity reset, saved/published distinction |
| Publication | Syncs operational inventory and application mapping | Existing publish endpoint/order; do not use preview state as published config |
| Inventory | Draft initial stock differs from live available stock | Signed adjustment, balances, unlimited mode and delivered counts; never reset on republish |
| Claims/redemption | Irreversible operational effect and stale-result risk | Exact claim identity, server atomicity and double-redemption rejection |
| Commercial access/subscriptions | Periods, payments, entitlements and role restrictions | Dates/time zones, amounts in minor units, idempotency keys, snapshot semantics, end-of-period cancellation |
| Onboarding | Multi-step persistent mutations | No duplicate organization/user/experience on retry; correct tenant handoff |
| Analytics | Operational SQL plus event fallback and multiple filters | Definitions, ranges, project/application mapping, stale-request handling, no zeros on failure |
| Shell/customer roles | Organization selection and front/backend permission distinction | Server remains authority; member/viewer tested separately; no cross-tenant stale detail |
| Runtime preview/link | Shared renderer and public telemetry | No real participation from CRM preview; stable slug/QR; no altered selection or telemetry semantics |

Every recommendation above inherits its matching regression boundary here. Cosmetic primitives also need smoke checks wherever they wrap a form or mutation button.

## 25. Recommended acceptance criteria for redesign

1. Complete a numbered screenshot inventory for admin and customer, plus member/viewer where fixtures exist. Mark inaccessible or write-dependent states explicitly; never substitute mock screens for actual evidence.
2. At 1440×900, 1366×768, 768×1024 and 390×844, core authenticated screens have no document-level horizontal overflow. Tables may scroll within labeled containers. Modal actions remain reachable; long names and real payment histories do not break layouts.
3. Current destination and organization are always visible. Every primary nav item reaches a useful authorized screen. Unknown and planned routes are distinguishable.
4. Customer-facing actions agree with backend permissions. Member controls are semantically read-only; keyboard input cannot start forbidden edits. Viewer restrictions remain intentional.
5. Change a draft field: dirty status appears. Leaving/reloading/changing organization prompts appropriately. Saving refreshes publication status; publishing references the saved version and preserves the current stock and analytics application mapping.
6. Inventory preserves limited/unlimited semantics, units, IDs and balances. Disabled/busy states prevent duplicate user submission. Failed loads do not appear as zero stock.
7. Claim search has unambiguous code/result binding. Redemption success, missing code and already-redeemed failures remain distinguishable. The backend rejects double redemption exactly as before.
8. Analytics preserves all API metric definitions and values at every date/project/application filter. Home labels its actual scope. Awarded and redeemed prize counts are clearly distinguished.
9. Plan amounts, currencies, feature snapshots, capacities, commercial access periods, renewal and cancellation behavior are unchanged. Test with separately authorized disposable fixtures, never by exercising billing during this audit.
10. All fields have accessible names; dialogs have name, focus containment, Escape and focus restoration. Table headers/cells are semantic. Focus remains visible, statuses are not color-only, and chosen tokens meet the product's contrast targets.
11. Loading, empty, filtered-empty, forbidden, not-found and failed-load states are distinct, with a clear next action. Transient errors preserve input and filter context.
12. Re-run the existing functional acceptance suite in an explicitly authorized local environment after each high-risk implementation phase. This audit did not rerun it because several flows write data.

### Audit integrity and current Git status

At entry, the following files were already modified and were left untouched:

```text
 M README.md
 M apps/api/test/health.test.ts
 M apps/api/wrangler.toml
 M apps/web/src/App.tsx
```

Audit outputs: this Markdown file and the 25 numbered screenshots under `docs/crm-ui-ux-audit/`. No application code, business rules, database, billing, entitlements or production resources were modified. No commit, push or deploy was performed. The remaining U states are listed above; they are mutation-dependent, role-dependent or constrained by the browser's desktop viewport cap.

