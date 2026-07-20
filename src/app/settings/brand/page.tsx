import { getActiveOrgId } from "@/lib/active-org";
import { getOrg } from "@/lib/orgs";
import { currentUser } from "@/lib/auth/current";
import { getExperimentationStatus } from "@/lib/experimentation";
import { listAuditEvents } from "@/lib/audit";
import { PageHeader, EmptyState, TimeAgo } from "@/components/ui";
import { ExperimentationSettings } from "@/components/ExperimentationSettings";

export const dynamic = "force-dynamic";

export default async function BrandSettingsPage() {
  const [orgId, user] = await Promise.all([getActiveOrgId(), currentUser()]);
  if (!orgId) {
    return (
      <>
        <PageHeader title="Brand settings" />
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <EmptyState title="No active brand." hint="Create or select a customer first (top of the sidebar)." />
        </div>
      </>
    );
  }
  const [org, status, events] = await Promise.all([
    getOrg(orgId),
    getExperimentationStatus(orgId),
    listAuditEvents(orgId, 30),
  ]);
  return (
    <>
      <PageHeader title="Brand settings" subtitle={org?.name ?? orgId} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl space-y-5">
          <ExperimentationSettings initialStatus={status} canManage={user?.role === "admin"} />

          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border">
              <span className="text-[13px] font-semibold">Activity</span>
              <span className="text-[11px] text-muted-2 ml-2">Audit trail — governed actions on this brand.</span>
            </div>
            {events.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-muted-2">No activity yet.</div>
            ) : (
              events.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <div className="text-[12px]"><span className="font-mono text-muted-2">{e.action}</span> · {e.target}</div>
                    {e.detail && <div className="text-[11px] text-muted-2 mt-0.5 truncate">{e.detail}</div>}
                  </div>
                  <div className="text-[11px] text-muted-2 shrink-0 text-right">
                    <TimeAgo iso={e.at} />
                    <div>{e.actor}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
