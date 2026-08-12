import { PageHeader } from "@/components/ui";
import { ReportsList } from "@/components/ReportsList";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Who receives a readout, and when — a report is a name, an audience and a day"
      />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <ReportsList />
      </div>
    </>
  );
}
