import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { DetailsEditor } from "@/components/DetailsEditor";
import { RepoBranchSettings } from "@/components/RepoBranchSettings";
import { DeletePrototype } from "@/components/DeletePrototype";

export const dynamic = "force-dynamic";

/** Settings tab — experiment definition + housekeeping (rarely touched). */
export default async function PrototypeSettings({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const p = await (await getContentStore()).getPrototype(key);
  if (!p) notFound();
  return (
    <div className="space-y-5 max-w-2xl">
      <DetailsEditor p={p} />
      <details>
        <summary className="text-[14px] text-muted-2 cursor-pointer hover:text-foreground px-1 py-1">Advanced — change code location (repo &amp; branch)</summary>
        <div className="mt-2"><RepoBranchSettings prototypeKey={key} initialRepo={p.repo ?? null} /></div>
      </details>
      <DeletePrototype prototypeKey={key} name={p.name} />
    </div>
  );
}
