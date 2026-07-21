import { redirect } from "next/navigation";

/** The prototype workspace moved to a top-level route (prototype-first IA). */
export default async function LegacyPrototypeDetail({ params }: { params: Promise<{ siteKey: string; key: string }> }) {
  const { key } = await params;
  redirect(`/prototypes/${key}`);
}
