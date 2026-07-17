import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current";
import { getStore } from "@/lib/auth/store";
import { PageHeader } from "@/components/ui";
import { UsersManager } from "@/components/UsersManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/settings/users");
  if (user.role !== "admin") redirect("/");

  const store = await getStore();
  const users = await store.listUsers();

  return (
    <>
      <PageHeader title="Users" subtitle="Grant console access via one-time links · 365-day sessions" />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <UsersManager initialUsers={users} me={user.sub} />
      </div>
    </>
  );
}
