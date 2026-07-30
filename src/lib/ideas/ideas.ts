/**
 * Two feedback concepts, one store:
 *
 *  - **Backlog** (kind "backlog") — things a human wants to BUILD: prototype /
 *    feature ideas, org-level, promotable into a prototype.
 *  - **Recommendation** (kind "recommendation") — friction the agent (or a
 *    human) hit while building ONE prototype: a missing `.opmc/` file, a skill
 *    that should exist, a console bug. Prototype-scoped; lives on that
 *    prototype's Recommendations tab.
 *
 * Stored as a per-customer content-store flag — no schema migration. `kind` is
 * derived on read for legacy rows (had a prototypeKey → recommendation).
 */
import { getContentStore } from "../content/store";

export type IdeaCategory = "app" | "skill" | "workflow" | "bug" | "other";
export type IdeaStatus = "new" | "planned" | "done" | "declined";
export type IdeaKind = "backlog" | "recommendation";

export interface Idea {
  id: string;
  orgId: string;
  kind: IdeaKind;
  prototypeKey?: string;
  title: string;
  body: string;
  category: IdeaCategory;
  status: IdeaStatus;
  source: "claude" | "human";
  createdAt: string;
}

const CATEGORIES: IdeaCategory[] = ["app", "skill", "workflow", "bug", "other"];
const STATUSES: IdeaStatus[] = ["new", "planned", "done", "declined"];

const key = (orgId: string) => `ideas:${orgId}`;

/** Legacy rows predate `kind` — a prototype-scoped one was always a recommendation. */
function withKind(i: Idea): Idea {
  return { ...i, kind: i.kind ?? (i.prototypeKey ? "recommendation" : "backlog") };
}

export async function listIdeas(orgId: string | null | undefined): Promise<Idea[]> {
  if (!orgId) return [];
  const raw = await (await getContentStore()).getFlag(key(orgId));
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Idea[]).map(withKind).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  } catch { return []; }
}

/** The build backlog — org-level ideas to turn into prototypes. */
export async function listBacklog(orgId: string | null | undefined): Promise<Idea[]> {
  return (await listIdeas(orgId)).filter((i) => i.kind === "backlog");
}

/** Recommendations raised against one prototype. */
export async function listRecommendations(orgId: string | null | undefined, prototypeKey: string): Promise<Idea[]> {
  return (await listIdeas(orgId)).filter((i) => i.kind === "recommendation" && i.prototypeKey === prototypeKey);
}

/**
 * Read-modify-write the org's ideas list under compare-and-set — automated
 * QA runs auto-file Recommendations, so concurrent writers (two agent
 * batches, or a batch landing while a human updates a status) are normal;
 * a plain overwrite silently destroyed one side. `mutate` re-runs on a lost
 * race against the freshest list. Keeps the tail bounded (inbox, not archive).
 */
async function mutateIdeas(orgId: string, mutate: (list: Idea[]) => Idea[]): Promise<Idea[]> {
  const store = await getContentStore();
  const k = key(orgId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const raw = await store.getFlag(k);
    let list: Idea[] = [];
    if (raw) { try { const v = JSON.parse(raw); list = Array.isArray(v) ? (v as Idea[]).map(withKind) : []; } catch { list = []; } }
    const next = mutate(list).slice(0, 500);
    if (await store.compareAndSetFlag(k, raw ?? null, JSON.stringify(next))) return next;
  }
  throw new Error("The ideas list is being updated by someone else right now — try again.");
}

export async function addIdea(input: {
  orgId: string;
  kind?: IdeaKind;
  prototypeKey?: string;
  title: string;
  body: string;
  category?: string;
  source?: "claude" | "human";
}): Promise<Idea> {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("A title is required.");
  const category = (CATEGORIES as string[]).includes(input.category ?? "") ? (input.category as IdeaCategory) : "other";
  // A prototype-scoped submission is a recommendation; otherwise it's backlog.
  const kind: IdeaKind = input.kind ?? (input.prototypeKey ? "recommendation" : "backlog");
  const idea: Idea = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    orgId: input.orgId,
    kind,
    prototypeKey: input.prototypeKey,
    title,
    body: (input.body ?? "").trim().slice(0, 20_000),
    category,
    status: "new",
    source: input.source ?? "claude",
    createdAt: new Date().toISOString(),
  };
  await mutateIdeas(input.orgId, (list) => [idea, ...list]);
  return idea;
}

export async function setIdeaStatus(orgId: string, id: string, status: string): Promise<Idea[]> {
  if (!(STATUSES as string[]).includes(status)) throw new Error("Unknown status.");
  const next = await mutateIdeas(orgId, (list) => list.map((i) => (i.id === id ? { ...i, status: status as IdeaStatus } : i)));
  return next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteIdea(orgId: string, id: string): Promise<Idea[]> {
  const next = await mutateIdeas(orgId, (list) => list.filter((i) => i.id !== id));
  return next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
