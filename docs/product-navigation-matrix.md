# CRM product navigation and workspace modes

## Scope

The CRM distinguishes two explicit contexts:

- **Internal Corsteno CRM:** a `super_admin` or `corsteno_admin` without a selected customer workspace.
- **Customer workspace:** a selected organization for a platform operator, or the organization selected by a normal customer account.

The internal context exposes `Inicio`, `Leads`, `Catálogo comercial`, `Suscripciones` and the platform onboarding action. Customer workspaces never expose `Leads` or the global commercial tools.

## Product types

The canonical CRM product registry is:

| `experiences.type` | Product | CRM treatment |
| --- | --- | --- |
| `roulette` | Ruleta | Managed experience, results, reports and prize redemption |
| `website` | Web | Explicit product record, site/channel tools and analytics when supported |
| `ar` | AR | Explicit product record/detail and analytics only when supported |
| `product-catalog` | Catálogo de productos | Products plus sites/channels |

`product-catalog` is not an alias for Web. No `map`, `configurator` or `3d` type was added.

The source of truth is `experiences.type`, filtered by the active `organization_id`. Application metadata is not used to infer customer navigation.

## Schema decision

Before the change, `experiences.type` was a plain `TEXT` column with no CHECK constraint or enum. The four-type registry is therefore an application-level canonicalization. No schema change and no migration were required.

Web and AR are registry-only CRM records in this sprint. They do not receive a false Roulette editor or an invented AR editor/runtime. Their detail view reports the product identity, status, public URL and analytics link only when the existing contract provides one.

## Navigation matrix

Every product item is declared in the central matrix in `apps/web/src/app/navigation.ts` with its required product capability and permission. Items from multiple assigned products are merged by key without duplicates.

| Workspace | Visible customer items | Explicitly blocked |
| --- | --- | --- |
| Roulette | Inicio, Ruleta, Resultados, Reportes, Canjear premio | Web, AR, Productos, Sitios y canales, Leads |
| Web | Inicio, Web, Sitios y canales, Analytics | Ruleta, AR, Productos, Canjear premio, Leads |
| AR | Inicio, Experiencia AR, Analytics | Ruleta, Web, Productos, Canjear premio, Leads |
| Catálogo | Inicio, Catálogo, Productos, Sitios y canales | Leads and Roulette-only modules |
| Roulette + Web | Union of the two sets, with one `Experiencias`, one `Analytics` and one `Sitios y canales` | AR, Catálogo, Leads |
| Empty | Inicio and the empty-workspace message | All product modules and Leads |

The backend applies the same tenant boundary to Leads and product-management routes. A normal customer account cannot call `/leads`, and product-management endpoints require an assigned `product-catalog` experience for the active organization.

## Production data audit

The production database currently contains Roulette and Product Catalog workspaces, plus empty organizations. No production Cosquín Rock organization and no Web or AR workspace was found during the audit. No customer or AR demo data was created to manufacture a test case.
