# Premium roulette layered asset prototype

This isolated visual-only prototype composes the existing PNG layers around a
simple six-segment wheel face. It does not import the CRM, runtime, API,
database, analytics, or functional roulette implementation.

## Open locally

From the repository root, enter the web workspace first:

```powershell
cd apps/web
pnpm exec vite --host 127.0.0.1 --port 5181 --config ../../prototypes/premium-roulette/vite.config.mjs ../../prototypes/premium-roulette
```

Then open `http://127.0.0.1:5181/` at a mobile viewport such as 390 × 844.

The physical-looking layers are served from
`prototypes/premium-roulette-assets/`. `target-composite.png` is retained as a
visual reference only and is not rendered by the prototype.
