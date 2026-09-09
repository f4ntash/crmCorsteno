# Corsteno staging sales demo plan

This is a preparation document only. It does not create Cloudflare resources, upload secrets, apply migrations, make payments, deploy, or push Git.

## 1. Proposed staging architecture

Use resources that are completely separate from production:

| Component | Proposed resource | Purpose |
|---|---|---|
| CRM | `corsteno-crm-staging` | Staging CRM build, served from an HTTPS staging hostname |
| API Worker | `corsteno-api-staging` | Staging API with staging-only origins and secrets |
| Runtime | `corsteno-runtime-staging` | Public roulette viewer for sales demos |
| D1 | `corsteno-db-staging` | Separate schema and data; never point staging at `corsteno-db` |
| R2 | `corsteno-experience-assets-staging` | Separate prize assets and uploads |

Suggested hostnames, subject to DNS/domain availability:

- CRM: `crm-staging.corsteno.com`
- API: `api-staging.corsteno.com`
- Runtime: `play-staging.corsteno.com`

The current repository has no staging resources. The current `apps/api/wrangler.toml` points both top-level and development configuration at the production D1/R2 names and IDs, so it must not be used for staging as-is.

## 2. Configuration and bindings

The staging API must have its own Wrangler environment or a separate staging config with:

- `DB` → `corsteno-db-staging`
- `EXPERIENCE_ASSETS` → `corsteno-experience-assets-staging`
- `ENVIRONMENT=staging`
- `APP_VERSION` set by the release pipeline
- `WEB_ORIGINS=https://crm-staging.corsteno.com`
- `PUBLIC_ORIGINS=https://play-staging.corsteno.com`

The staging CRM/runtime builds must use:

- `VITE_API_URL=https://api-staging.corsteno.com`
- `VITE_RUNTIME_BASE_URL=https://play-staging.corsteno.com`

No production values should be copied into a staging `.env` file. Secrets must be entered with `wrangler secret put` or the chosen CI secret store, never committed.

## 3. Migration plan

The repository contains migrations `0000` through `0017`, in lexical order:

`0000` base schema, `0001` auth/application additions, `0002` application credentials, `0003` application type, `0004` experiences, `0005` persisted experience status, `0006`–`0007` prize inventory, `0008` analytics application, `0009` spin history, `0010` participation limits, `0011` prize claims, `0012` access periods, `0013` plans/subscriptions, `0014` payments, `0015` commercial catalog, `0016` free/offline/grants, `0017` subscription feature entitlements.

The exact staging-only commands, to be run later by an authorized operator after creating the separate database, are:

```powershell
pnpm --filter @corsteno/api exec wrangler d1 create corsteno-db-staging
pnpm --filter @corsteno/api exec wrangler d1 migrations apply corsteno-db-staging --remote --env staging
pnpm --filter @corsteno/api exec wrangler d1 migrations list corsteno-db-staging --remote --env staging
```

The database ID returned by creation must be placed in the staging-only Wrangler configuration. Do not replace the production ID in the current config.

Migration state at audit time:

- Local: all migrations through `0017` applied; no local migrations pending.
- Remote production: `0000`–`0005` were reported applied in earlier work; `0006`–`0017` are unknown.
- Staging: does not exist yet.

The remote production listing was attempted read-only and failed with Cloudflare error `7403` (account not authorized). No remote command that changes data was run.

## 4. Staging seed strategy

Do not reuse `pnpm seed:local` or the credentials `admin@admin.com` / `password`.

Create a separate staging bootstrap process that:

1. Requires an explicit `ENVIRONMENT=staging` guard.
2. Requires credentials supplied through environment variables or an interactive secret mechanism.
3. Generates a random password on first bootstrap or accepts a one-time operator-provided password.
4. Stores only the password hash in D1.
5. Is idempotent by stable staging fixture IDs and unique slugs.
6. Never contains a default password or production database ID.

The demo organization should be a staging-only organization using Corsteno demo branding, with no real customer names or PII.

## 5. Sales demo fixture definitions

Prepare three staging experiences from existing templates:

- **Premium Roulette**: premium template, 3D enabled, unlimited and limited prizes, celebration enabled, participation policy configured, QR and analytics enabled. Enable claims and AR only under the Professional/Enterprise entitlement snapshot.
- **Festival Roulette**: festival template, several colorful segments, one no-prize segment, limited stock of one prize, participation cooldown, analytics and QR.
- **Corporate Roulette**: corporate template, restrained colors, result CTA, unlimited prize, no real customer branding.

Fixture checks should cover:

- published configuration and effective active status;
- a valid commercial subscription/access period;
- inventory loaded without negative stock;
- analytics application mapping;
- claims only where the entitlement snapshot includes `redemption_claims`;
- AR button only where `webxr_ar` is entitled and the device reports support.

No real payment records should be seeded as if they were customer payments. If an offline demo is needed, use clearly labeled staging demo data and an explicit operator action.

## 6. Physical mobile matrix

| Device/browser | Required check | Expected result |
|---|---|---|
| Android Chrome, current stable | HTTPS runtime, 3D, spin, result, claim, QR | Normal 3D and spin work |
| Android WebXR-capable device | AR capability/session/hit-test flow | AR works or falls back to normal 3D with a visible error |
| iPhone Safari, current supported version | QR, runtime, responsive 3D/fallback, spin | Normal 3D or SVG fallback works; do not claim WebXR |
| Desktop Chrome | CRM, QR, runtime, spin, analytics | Full operator and runtime flow works |

The following must be checked at mobile widths: CTA remains reachable, result card and claim code fit without horizontal scrolling, canvas resizes, and AR controls are not shown when unsupported or not entitled.

## 7. Android WebXR manual test

1. Open a QR-generated `https://play-staging.corsteno.com/r/<slug>` URL in Chrome on the Android device.
2. Confirm the experience loads and `experience_view` arrives in staging analytics.
3. Confirm `Ver en AR` is visible only for an entitled, supported experience.
4. Tap AR and confirm `roulette_ar_open_click`.
5. Move the device until the reticle/hit-test surface is available.
6. Place the roulette and confirm `roulette_ar_session_started` and `roulette_ar_placed`.
7. Tap `Girar`; confirm the server returns the authoritative `spinId`/result before animation.
8. Confirm animation, winner/no-prize state, celebration, and claim display.
9. Exit AR and confirm `roulette_ar_session_ended`.
10. Confirm normal 3D remains usable after AR exit or AR failure.

Do not mark iOS WebXR as supported. If Android hardware is unavailable, leave this as an explicit pending test.

## 8. QR test

1. In staging CRM, select the staging organization and published experience.
2. Open the existing QR action and verify the host is `play-staging.corsteno.com`, not localhost or production.
3. Scan from a phone on a network that can reach the staging host.
4. Verify the runtime loads the same staging API and D1 data.
5. Repeat with a production URL only after production is separately approved; never mix QR environments.

## 9. Mercado Pago sandbox

Only sandbox values belong in staging:

- sandbox access token;
- staging webhook secret;
- public HTTPS staging webhook URL, for example `https://api-staging.corsteno.com/webhooks/mercado-pago`;
- staging success/failure/pending URLs.

The provider must be configured with test credentials and test payer/cards. Automatic renewal and recurring billing remain out of scope and must not be enabled as part of this rollout.

## 10. Minimum observability

Use existing Cloudflare and application capabilities:

- Worker request/error logs;
- D1 error responses and migration output;
- R2 upload/read failures;
- runtime console/network errors during the mobile test;
- spin response status and `spinId`;
- claim status and redemption response;
- webhook signature/status logs without secrets;
- analytics event arrival by application and time range.

Do not add a new observability platform for staging V1.

## 11. Rollback

- Stop directing demo traffic to the staging hostname and disable the staging Worker/Pages deployment through the platform controls.
- Revert the application release to the previous known-good commit or redeploy the previous staging artifact.
- Preserve the staging D1 database for investigation; do not reset or recreate it as a first response.
- Do not assume destructive SQL migrations can be rolled back. Use a forward corrective migration and restore/export procedures approved for the staging database.
- Revoke or rotate staging secrets if exposed.

Production resources and production data are not part of this rollback plan.

## 12. Sales-demo checklist

- [ ] Staging CRM/API/runtime hostnames resolve over HTTPS.
- [ ] Staging D1 and R2 bindings point to staging resources.
- [ ] Authorized staging user can log in; no local default credentials are used.
- [ ] Demo organization and Premium/Festival/Corporate experiences exist.
- [ ] Selected experience is published and commercial access is active.
- [ ] Inventory and participation rules are intentionally configured.
- [ ] QR points to the staging runtime.
- [ ] Runtime loads published config and the 3D/SVG fallback works.
- [ ] Spin returns an authoritative result and records history.
- [ ] No-prize and limited-stock paths were tested.
- [ ] Claims and one-time redemption were tested where entitled.
- [ ] Analytics view, spins, prizes, no-prize, and timeline events arrive.
- [ ] Android AR was tested if AR is part of the sales story.
- [ ] No production URLs, secrets, payments, or database IDs appear in the demo.

## Exact blockers before staging deployment

1. Resolve Cloudflare account authorization error `7403` and verify the intended account/zone permissions.
2. Create the separate staging D1, R2 bucket, Worker, Pages/hosting targets, and DNS records.
3. Add an explicit staging Wrangler configuration without changing production bindings.
4. Configure staging secrets and sandbox payment credentials through the secret manager.
5. Add a guarded staging seed/bootstrap with non-default credentials.
6. Apply and verify migrations `0000`–`0017` on the new staging D1.
7. Complete the Android WebXR test on physical hardware.
8. Perform an authorized staging deployment and smoke test.
