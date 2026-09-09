# Pre-sales hardening notes

This document describes the current operational boundary of the roulette product. It is a staging checklist, not a production deployment procedure.

## Known security boundary

- CRM routes require the HttpOnly session cookie, an `X-Organization-Id` context, and the relevant `crm.read`/`crm.manage` permission.
- Platform catalog, offline payment, courtesy grant, and manual access operations require a platform operator server-side.
- Public experience reads and spins require a published experience, active effective status, active commercial access (or the documented legacy-unrestricted case), and a valid published roulette configuration.
- Inventory delivery and spin history are written in the same D1 batch as the guarded stock decrement. Exhausted limited prizes are not delivered, and a failed decrement does not produce an authoritative successful spin.
- Claims are high-entropy bearer-like codes. The code is returned only with the winning spin and redemption is tenant-scoped and single-use.
- Analytics writes are deliberately secondary: tracking failures are ignored by the runtime and cannot turn a successful authoritative spin into a failure.

## Participation limitation

Device identity is stored in browser `localStorage` and session identity in `sessionStorage`. Clearing site storage, changing browser profiles, or using another device resets those identifiers. These controls are useful participation limits, not strong anti-fraud or bot prevention. A future abuse-control layer is required for high-value campaigns.

## Environment checklist

Required runtime bindings/configuration should be supplied by the deployment environment, never committed:

- `DB`: Cloudflare D1 binding (`corsteno-db`).
- `EXPERIENCE_ASSETS`: Cloudflare R2 binding when prize uploads are enabled.
- `WEB_ORIGINS` / `WEB_ORIGIN`: exact CRM origins; production must not use `*` with credentials.
- `PUBLIC_ORIGINS`: exact public runtime origins where public event ingestion is enabled.
- `VITE_API_URL`: API base URL for CRM and runtime builds.
- `VITE_RUNTIME_BASE_URL`: public runtime base URL used for QR links.
- `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, and payment callback URLs: production secrets/config only.

## Migration rollout checklist

1. Confirm Cloudflare account authorization and the target D1 database with a read-only `wrangler whoami` and D1 listing query.
2. Compare the local migration directory with the remote migration list.
3. Run the full local test/typecheck/lint/build suite.
4. Review the exact migration SQL and take an operational backup/export according to the production policy.
5. Apply migrations only through the approved release operator, then verify schema and row counts.
6. Smoke-test login, public experience loading, spin, inventory, claim redemption, and analytics.

At the time of this audit, local D1 has no pending migrations. Remote migration state is **unknown** because the configured Cloudflare account returned authorization error 7403 during the read-only listing attempt. No remote migration was run.

## Current known limitations

- No strong public abuse/rate-limit infrastructure beyond configured participation limits.
- Public analytics event ingestion is intentionally anonymous and best-effort; it should not be treated as a billing or prize ledger.
- Physical WebXR behavior on Android hardware remains a device-level verification item.
- Production remote schema and R2 readiness still require an authorized staging/production operator.
