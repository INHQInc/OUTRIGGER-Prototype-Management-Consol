/** Append-only audit trail (org-scoped). */
import { getContentStore } from "../content/store";
import type { AuditEvent } from "./types";

export type { AuditEvent } from "./types";

export async function audit(orgId: string, actor: string, action: string, target: string, detail?: string): Promise<void> {
  if (!orgId) return;
  await (await getContentStore()).addAuditEvent({
    id: crypto.randomUUID(),
    orgId,
    actor: actor || "system",
    action,
    target,
    detail,
    at: new Date().toISOString(),
  });
}

export async function listAuditEvents(orgId: string, limit?: number): Promise<AuditEvent[]> {
  return (await getContentStore()).listAuditEvents(orgId, limit);
}
