import { PageHeader, EmptyState } from "@/components/ui";

export default function HandoffPage() {
  return (
    <>
      <PageHeader title="Handoff" subtitle="Package features for Rightpoint / Outrigger developers" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <EmptyState
          title="Handoff generation is the final milestone."
          hint="Per feature: code in their block conventions, humanized injection manifest, source-map notes, demo link, and a git-apply patch."
        />
      </div>
    </>
  );
}
