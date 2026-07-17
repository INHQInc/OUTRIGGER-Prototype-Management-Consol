import { PageHeader, EmptyState } from "@/components/ui";

export default function DeploysPage() {
  return (
    <>
      <PageHeader title="Deploys" subtitle="Publish pages + features to protected preview URLs" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <EmptyState
          title="Deploys arrive after Features."
          hint="Pick pages @ versions, toggle features on/off, publish to a password-protected Vercel URL."
        />
      </div>
    </>
  );
}
