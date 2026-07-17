# OUTRIGGER Prototype Management Console

Local-first Next.js console for cloning, prototyping, experimenting on, and handing off features for **outrigger.com** and **hawaiivacationcondos.outrigger.com**.

**Pipeline:** capture sanitized, versioned page clones → build overlay features → deploy demos → optionally A/B test via Optimizely → hand off to devs in their block conventions.

## Docs

- [`AGENTS.md`](AGENTS.md) — invariants, architecture, env vars (read before coding).
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — current state & how to continue (read first each session).
- [`docs/CONSOLE-UI-SPEC.md`](docs/CONSOLE-UI-SPEC.md) — screens & UX.
- [`docs/EXPERIMENT-INTEGRATION.md`](docs/EXPERIMENT-INTEGRATION.md) — Optimizely experiment lifecycle, lock & sync.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

## Common commands

```bash
npm run dev                                        # dev server
npx tsc --noEmit                                   # typecheck (run before committing)
npx tsx scripts/capture.ts <outrigger|hvc> <url>   # capture a page snapshot
npx tsx scripts/export-variation.ts <feature-key>  # export an Optimizely variation
```

## Layout

```
src/lib/capture/     capture pipeline (scrape, assets, sanitize)
src/lib/registry.ts  page/version registry (reads snapshots/)
src/lib/features/    overlay feature model + registry (features/)
src/lib/optimizely/  variation exporter
src/lib/auth/        session auth + user store seam
src/app/             console UI + API routes + /snap serving
features/            overlay features (git-tracked)
snapshots/           captured clones (gitignored, local)
```

Notes: the console is **local-first** (captures write the local filesystem; Vercel FS is read-only). Snapshots and `.env.local` are gitignored. Deploys are protected + noindex; clones ship no tracking.
