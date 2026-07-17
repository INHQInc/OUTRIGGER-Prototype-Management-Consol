import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { requireAdmin } from "@/lib/auth/current";

async function guard() {
  try { await requireAdmin(); return null; }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const store = await getStore();
  return NextResponse.json({ users: await store.listUsers() });
}

/** POST { email, name?, role? } — add or update a user. */
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const { email, name, role } = await req.json().catch(() => ({}));
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const store = await getStore();
  const user = await store.upsertUser({
    email: String(email).toLowerCase(),
    name: name ? String(name) : undefined,
    role: role === "admin" ? "admin" : "member",
  });
  return NextResponse.json({ user });
}

/** DELETE ?email= — remove a user (and their codes/session ability). */
export async function DELETE(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const store = await getStore();
  await store.deleteUser(email.toLowerCase());
  return NextResponse.json({ ok: true });
}
