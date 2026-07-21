import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { RepoBranchSettings } from "@/components/RepoBranchSettings";
import { DeletePrototype } from "@/components/DeletePrototype";

export const dynamic = "force-dynamic";

/** Settings tab — configuration: code location + danger zone. */
export default async function PrototypeSettings({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const p = await (await getContentStore()).getPrototype(key);
  if (!p) notFound();
  return (
    <div className="space-y-5 max-w-2xl">
      <RepoBranchSettings prototypeKey={key} initialRepo={p.repo ?? null} />
      <DeletePrototype prototypeKey={key} name={p.name} />
    </div>
  );
}
