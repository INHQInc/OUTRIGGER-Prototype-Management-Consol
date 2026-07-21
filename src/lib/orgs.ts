/**
 * Org = tenant / customer brand — the top of the tree and the isolation
 * boundary. Sites (and everything under them) belong to an org. Nothing is
 * seeded; users create orgs.
 */
import { getContentStore } from "./content/store";

export type OrgRole = "admin" | "member";

export interface Org {
  id: string;
  name: string;
  createdAt: string;
}

/** org membership: which users can access an org, and their role in it. */
export interface OrgMember {
  orgId: string;
  email: string;
  role: OrgRole;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
}

export async function listOrgs(): Promise<Org[]> {
  return (await getContentStore()).listOrgs();
}

export async function getOrg(id: string): Promise<Org | null> {
  return (await getContentStore()).getOrg(id);
}

export async function addOrg(name: string): Promise<Org> {
  const store = await getContentStore();
  const existing = new Set((await store.listOrgs()).map((o) => o.id));
  const base = slugify(name);
  let id = base;
  let n = 2;
  while (existing.has(id)) id = `${base}-${n++}`;
  const org: Org = { id, name: name.trim() || id, createdAt: new Date().toISOString() };
  await store.addOrg(org);
  return org;
}

/** Rename a customer/brand. */
export async function renameOrg(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error("A name is required");
  await (await getContentStore()).updateOrg(id, { name: clean });
}

/** Delete an org and cascade-delete its sites (which cascade their content). */
export async function deleteOrg(id: string): Promise<void> {
  const store = await getContentStore();
  const sites = (await store.listDynamicSites()).filter((s) => s.orgId === id);
  for (const s of sites) await store.deleteSite(s.siteKey);
  await store.deleteOrg(id);
}

// --- membership ---
export async function listMembers(orgId: string): Promise<OrgMember[]> {
  return (await getContentStore()).listMembers(orgId);
}
export async function addMember(orgId: string, email: string, role: OrgRole): Promise<void> {
  await (await getContentStore()).putMember({ orgId, email: email.toLowerCase().trim(), role });
}
export async function removeMember(orgId: string, email: string): Promise<void> {
  await (await getContentStore()).removeMember(orgId, email.toLowerCase().trim());
}
export async function orgsForMember(email: string): Promise<string[]> {
  return (await getContentStore()).orgIdsForMember(email.toLowerCase().trim());
}
