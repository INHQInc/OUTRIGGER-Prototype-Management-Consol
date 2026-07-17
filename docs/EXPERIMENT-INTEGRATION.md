# Experiment Integration (Optimizely)

*Last updated: 2026-07-17*

The Experiment area lets a feature be tested as a live Optimizely **Web Experimentation** A/B test (or Personalization experience) *before* permanent dev handoff. The same overlay that powers a deploy becomes the experiment variation — no re-authoring.

## Optimizely environment facts

Account **OUHH Outrigger Hotels Hawaii** → Experimentation. Snippet is dynamic-website aware (MutationObservers).

| Env | Project ID | Site | Snippet |
|---|---|---|---|
| **Prep (sandbox)** | `24138040550` | prep.outrigger.com | `cdn.optimizely.com/js/24138040550.js` |
| **Prod** | `21089662478` | www.outrigger.com | `cdn.optimizely.com/js/21089662478.js` |

Products available: **Web Experimentation** (A/B — lead) and **Personalization** (audience targeting — second mode). Same variation code, different campaign wrapper.

## Lifecycle (feature ↔ experiment binding)

```
 Draft ──promote──▶ Synced draft ──human starts──▶ Running (LOCKED) ──stop──▶ Concluded
   ▲                    │  ▲                              │                        │
   └──── edit ──────────┘  └──── Pause & unlock ──────────┘             Handoff / Archive
```

1. **Draft** — no binding; overlay freely editable.
2. **Synced draft** — experiment created in Optimizely, **paused**. Editable; each edit re-syncs the variation via API.
3. **Running (locked)** — experiment live, collecting data. Console makes the feature **read-only**. Edit only via **Pause & unlock**.
4. **Concluded** — stopped; results attached; unlocks → Handoff winner or Archive.

## Lock rules

- `status = running` ⇒ console blocks all writes to `features/<key>/*` (UI read-only, write APIs 409).
- Unlock path is an explicit **Pause & unlock** action.
- **Console may PAUSE, never START.** Starting live traffic is always a human action inside Optimizely. (Pausing only reduces exposure, so it's safe to automate.)

## Sync rules

- **Fingerprint** = hash of (all overlay files + manifest injections). Stored as `lastSyncedHash` on each push.
- Local edit ⇒ fingerprint differs ⇒ console shows "N unsynced changes" + a diff.
- **Sync to Optimizely** regenerates the variation (see [exporter](../src/lib/optimizely/export.ts)) and PATCHes the variation actions; updates `lastSyncedHash`.
- **Cannot sync a running experiment** — console forces Pause first so results are never contaminated.

## Binding storage (runtime state, NOT git)

Lives in the store seam (JSON local `.data/` / Neon hosted). One row per (feature, environment):

```
experiment_binding {
  featureKey, environment ('prep'|'prod'),
  projectId, experimentId, variationId,
  status ('paused'|'running'|'concluded'),
  lastSyncedHash, lastSyncedAt, createdAt
}
```

Overlay files stay in git; the binding (external IDs + live status) is deployment state.

## API operations (Optimizely REST v2)

Base `https://api.optimizely.com/v2`, Bearer `OPTIMIZELY_API_TOKEN`.

- **Create experiment** (type `a/b`, status `paused`) with a Page (URL targeting) + variations: control (weight 50, no actions) and variant (weight 50, custom JS/CSS actions from the exporter).
- **Update variation** — push regenerated variation on Sync.
- **Get experiment** — poll status + results.
- **Pause** — set status `paused` (console-allowed).
- **Start** — human-only, in Optimizely UI.

Env: `OPTIMIZELY_API_TOKEN` (scoped service-account PAT), `OPTIMIZELY_PROJECT_ID` (start with Prep `24138040550`).

## Build status

- ✅ **Exporter** (`src/lib/optimizely/export.ts`) — overlay → variation JS (idempotent, MutationObserver-based for dynamic DOM) + CSS + live-URL targeting + selector robustness lint. Verified rendering on the Waikiki clone.
- ⏳ **Draft push** — create paused experiment in Prep via API (needs `OPTIMIZELY_API_TOKEN`).
- ⏳ **Binding store** — experiment_binding in store seam.
- ⏳ **Lock + Sync + drift UI** — the Experiment area in the console.
- ⏳ **Personalization mode** — same variation, audience wrapper.

## Safety recap

1. Prove everything against **Prep** first; flip `OPTIMIZELY_PROJECT_ID` to Prod only once trusted.
2. Console **creates paused drafts and pauses**; it **never starts** production traffic.
3. Running experiments are **locked** against edits to protect result integrity.
