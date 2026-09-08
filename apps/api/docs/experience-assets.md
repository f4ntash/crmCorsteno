# Experience assets

Experience prize icons are stored in the `EXPERIENCE_ASSETS` R2 binding under
tenant-scoped keys:

```text
organizations/{organizationId}/experiences/{experienceId}/{uuid}.{png|svg}
```

The Worker serves only keys matching that generated shape at
`/assets/{key}`. Uploads require an authenticated session and the selected
organization must own the experience. PNG files are checked against their
binary signature. SVG files are accepted only when they have an SVG root and
contain no scripts, event handlers, `foreignObject`, embedded objects,
DOCTYPE/entities, external references, or CSS `url()` references.

The bucket binding is prepared in `wrangler.toml`, but no remote bucket was
created automatically. An operator can create it explicitly when ready:

```bash
pnpm --filter @corsteno/api exec wrangler r2 bucket create corsteno-experience-assets
```

The upload limit is 2 MiB per file. Removing an icon from a draft does not
delete the old R2 object yet.
