import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { DetailsEditor } from "@/components/DetailsEditor";

export const dynamic = "force-dynamic";

/** Details tab — the experiment definition: targets, hypothesis, metrics, brief. */
export default async function PrototypeDetails({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const p = await (await getContentStore()).getPrototype(key);
  if (!p) notFound();
  return (
    <div className="max-w-2xl">
      <DetailsEditor p={p} />
    </div>
  );
}
