import { redirect } from "next/navigation";

/** Settings folded into the command rail — old links land on the same content. */
export default async function PrototypeSettings({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  redirect(`/prototypes/${key}?tab=repo`);
}
