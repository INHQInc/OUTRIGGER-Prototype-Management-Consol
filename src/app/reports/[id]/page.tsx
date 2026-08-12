import { PageHeader } from "@/components/ui";
import { ReportDetail } from "@/components/ReportDetail";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageHeader title="Report" subtitle="The name is the subject line" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <ReportDetail id={id} />
      </div>
    </>
  );
}
