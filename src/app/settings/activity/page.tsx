import { getActiveOrgId } from "@/lib/active-org";
import { getOrg } from "@/lib/orgs";
import { listAuditEvents } from "@/lib/audit";
import { PageHeader, EmptyState, TimeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    return (
      <>
        <PageHeader title="Activity" />
        <div className="flex-1 overflow-y-auto px-8 py-6"><EmptyState title="No customer selected." hint="Pick or create a customer at the top of the sidebar." /></div>
      </>
    );
  }
  const [org, events] = await Promise.all([getOrg(orgId), listAuditEvents(orgId, 100)]);
  return (
    <>
      <PageHeader title="Activity" subtitle={`Audit trail — governed actions on ${org?.name ?? orgId}`} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl rounded-xl border border-border bg-surface overflow-hidden">
          {events.length === 0 ? (
            <div className="px-4 py-8 text-center text-[14px] text-muted-2">No activity yet.</div>
          ) : (
            events.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-border last:border-0">
                <div className="min-w-0">
                  <div className="text-[14px]"><span className="font-mono text-muted-2">{e.action}</span> · {e.target}</div>
                  {e.detail && <div className="text-[13px] text-muted-2 mt-0.5 truncate">{e.detail}</div>}
                </div>
                <div className="text-[13px] text-muted-2 shrink-0 text-right">
                  <TimeAgo iso={e.at} />
                  <div>{e.actor}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
