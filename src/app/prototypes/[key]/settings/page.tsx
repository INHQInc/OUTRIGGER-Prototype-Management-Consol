import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { DetailsEditor } from "@/components/DetailsEditor";
import { DeletePrototype } from "@/components/DeletePrototype";

export const dynamic = "force-dynamic";

/** Settings tab — the experiment definition (hypothesis, metrics, ownership)
 *  and the danger zone. Code location lives on the Build tab; the build brief
 *  and target pages on Setup / Pages. */
export default async function PrototypeSettings({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const p = await (await getContentStore()).getPrototype(key);
  if (!p) notFound();
  return (
    <div className="space-y-5 max-w-2xl">
      <DetailsEditor p={p} />
      <DeletePrototype prototypeKey={key} name={p.name} />
    </div>
  );
}
