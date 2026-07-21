import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { RepoBranchSettings } from "@/components/RepoBranchSettings";
import { SourcePanel } from "@/components/SourcePanel";

export const dynamic = "force-dynamic";

/** Build tab — where the code lives (repo/branch) + the built-variation status,
 *  cut a version, and version history. */
export default async function PrototypeBuild({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const p = await (await getContentStore()).getPrototype(key);
  if (!p) notFound();
  const versions = await listArtifactVersions(key);
  return (
    <div className="space-y-4 max-w-2xl">
      <RepoBranchSettings prototypeKey={key} initialRepo={p.repo ?? null} />
      <SourcePanel prototypeKey={key} versions={versions} />
    </div>
  );
}
