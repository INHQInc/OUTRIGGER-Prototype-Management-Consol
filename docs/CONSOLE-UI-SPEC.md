# Console UI Spec

*Last updated: 2026-07-17*

## Mental model — 3 nouns

- **Page** — a URL from a site (outrigger / hvc), with immutable captured **versions**.
- **Feature** — a named overlay: files + injection points, targeting one or more pages.
- **Deploy** — (pages @ versions) + (features on/off) published to a protected URL.

A user's sentence — "the Waikiki page with Trip Planner on, shareable" — maps 1:1 to these.

## Screens

1. **Sites & Pages (home)** — two site cards; page library (URL, last synced, version count, targeting features). Actions: Sync Content, Preview, History. Add Pages accepts pasted URLs + offers discovered sub-pages as checkboxes.
2. **Page detail** — version timeline, live preview of any version, sanitization report (audit trail), upstream diff on Sync (before/after + changed assets) before rebasing pinned prototypes.
3. **Features** — list (name, status draft/demo-ready/handed-off, target pages). Detail tabs: Files, Injection Points (structured selectors w/ click-to-pick), Targets (pages @ pinned versions).
4. **Deploys** — builder (pick pages, toggle features matrix, Deploy → protected URL); history. Optional floating feature-switcher injected into demo deploys for live on/off.
5. **Handoff** — per-feature package generator (see below).

## Decisions (v1)

- **No database.** Snapshot filesystem (`meta.json` per version) is the page registry; features are files in `features/`; deploys are a JSON log. Add Neon only if outgrown.
- **Code lives in git**, not a DB. Overlay files are real files under `features/<name>/`. Console renders/injects/toggles/hands-off; in-browser Monaco editing is v2.
- **Handoff audience = Rightpoint devs** — shareable handoff page + `git apply` patch against their real block structure. We never push to their repo.

## Handoff design

Outrigger's site is built as **self-contained blocks** (folder per component: `.cshtml` + `.ts` + `.scss`; webpack emits readable per-block filenames). Every change classifies into one bucket, which determines the artifact:

| Change type | Example | Artifact |
|---|---|---|
| New component | Trip Planner widget | Block folder in their convention: `TripPlannerBlock/{.cshtml,.scss,.ts}` |
| Modify existing | Restyle hero CTA | Override CSS + note: "in `Blocks/BannerBlock/BannerBlock.scss`, change X" (mapped via read-only Azure DevOps clone) |
| Content change | New headline/image | CMS instruction sheet (Optimizely), not code |

Handoff package per feature:
1. Code re-expressed in their conventions (new components literally shaped as a block folder)
2. Humanized injection manifest (selector + template location in their repo)
3. Source-map notes (touched elements → real file paths via the repo clone)
4. Living proof (protected demo deploy link + before/after screenshots)
5. Integration checklist (env assumptions, added assets/fonts, known gaps)

Export as: shareable read-only handoff page (URL + password), ZIP download, and a git patch (`git apply` on a branch → normal PR through their pipeline).

## Build order

1. App shell + Sites & Pages (wraps proven capture pipeline)
2. Page detail (versions, preview, report, sync diff)
3. Features + injection
4. Deploys
5. Handoff generator
