import { notFound } from "next/navigation";
import { getContentStore } from "@/lib/content/store";
import { BriefEditor } from "@/components/BriefEditor";

export const dynamic = "force-dynamic";

/** Brief tab — the living build brief (you + Claude both edit). */
export default async function PrototypeBriefPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const p = await (await getContentStore()).getPrototype(key);
  if (!p) notFound();
  return <BriefEditor prototypeKey={key} initial={p.brief} />;
}
