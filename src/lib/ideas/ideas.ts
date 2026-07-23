/**
 * Ideas — the feedback channel from the Claude instances doing the work back to
 * the platform.
 *
 * A prototype-building instance sees the friction first-hand: a missing file in
 * `.opmc/`, a skill that should exist, a console bug, a verification loop that
 * lies. Without a channel, that knowledge either evaporates or has to be
 * hand-relayed by whoever happens to read the transcript. This makes it a
 * first-class submission, attributable to the prototype it came from.
 *
 * Stored as a per-customer content-store flag — no schema migration.
 */
import { getContentStore } from "../content/store";

export type IdeaCategory = "app" | "skill" | "workflow" | "bug" | "other";
export type IdeaStatus = "new" | "planned" | "done" | "declined";

export interface Idea {
  id: string;
  orgId: string;
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

export async function listIdeas(orgId: string | null | undefined): Promise<Idea[]> {
  if (!orgId) return [];
  const raw = await (await getContentStore()).getFlag(key(orgId));
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Idea[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  } catch { return []; }
}

async function write(orgId: string, list: Idea[]): Promise<void> {
  // Keep the tail bounded — this is an inbox, not an archive.
  await (await getContentStore()).setFlag(key(orgId), JSON.stringify(list.slice(0, 500)));
}

export async function addIdea(input: {
  orgId: string;
  prototypeKey?: string;
  title: string;
  body: string;
  category?: string;
  source?: "claude" | "human";
}): Promise<Idea> {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("An idea needs a title.");
  const category = (CATEGORIES as string[]).includes(input.category ?? "") ? (input.category as IdeaCategory) : "other";
  const idea: Idea = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    orgId: input.orgId,
    prototypeKey: input.prototypeKey,
    title,
    body: (input.body ?? "").trim().slice(0, 20_000),
    category,
    status: "new",
    source: input.source ?? "claude",
    createdAt: new Date().toISOString(),
  };
  const list = await listIdeas(input.orgId);
  await write(input.orgId, [idea, ...list]);
  return idea;
}

export async function setIdeaStatus(orgId: string, id: string, status: string): Promise<Idea[]> {
  if (!(STATUSES as string[]).includes(status)) throw new Error("Unknown status.");
  const list = await listIdeas(orgId);
  const next = list.map((i) => (i.id === id ? { ...i, status: status as IdeaStatus } : i));
  await write(orgId, next);
  return next;
}

export async function deleteIdea(orgId: string, id: string): Promise<Idea[]> {
  const next = (await listIdeas(orgId)).filter((i) => i.id !== id);
  await write(orgId, next);
  return next;
}
