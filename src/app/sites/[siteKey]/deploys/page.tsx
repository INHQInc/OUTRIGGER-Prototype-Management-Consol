import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SiteDeploys() {
  return (
    <EmptyState
      title="Deploys for this site — coming soon."
      hint="Today: publish a protected preview URL from the CLI — npx tsx scripts/deploy.ts <feature-key>. This tab will list and manage those deploys."
    />
  );
}
