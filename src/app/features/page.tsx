import { PageHeader, EmptyState } from "@/components/ui";

export default function FeaturesPage() {
  return (
    <>
      <PageHeader title="Features" subtitle="Overlay features injected onto captured pages" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <EmptyState
          title="Features are the next build milestone."
          hint="Each feature = namespaced overlay files + injection points, targeting pinned page versions."
        />
      </div>
    </>
  );
}
