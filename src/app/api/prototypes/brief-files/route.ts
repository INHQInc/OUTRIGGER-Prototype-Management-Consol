import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { putBriefAttachment, getBriefAttachment } from "@/lib/prototypes/attachments";

/**
 * Supporting files on a brief. POST adds one, GET serves it, DELETE removes it
 * from the brief.
 *
 * The bytes are content-addressed and shared, so DELETE detaches rather than
 * erases: another prototype (or an earlier version of this one) may reference
 * the same file, and a brief edit must never reach across and break it.
 */
export async function POST(req: NextRequest) {
  let body: { key?: string; dataUrl?: string; fileName?: string; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.key || !body.dataUrl) return NextResponse.json({ error: "key and dataUrl required" }, { status: 400 });

  const g = await guardPrototypeAccess(body.key, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const user = await currentUser().catch(() => null);
  let attachment;
  try {
    attachment = await putBriefAttachment({
      siteKey: g.proto.siteKey, dataUrl: body.dataUrl, fileName: body.fileName ?? "",
      note: body.note, addedBy: user?.name ?? user?.sub ?? undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't store that file." }, { status: 400 });
  }

  const store = await getContentStore();
  const existing = g.proto.brief.attachments ?? [];
  if (existing.length >= 20) return NextResponse.json({ error: "A brief holds at most 20 supporting files." }, { status: 400 });
  // Same bytes AND same name is the same attachment — adding it twice is a
  // double-click, not a second file.
  const already = existing.some((a) => a.asset === attachment.asset && a.name === attachment.name);
  const attachments = already ? existing : [...existing, attachment];
  await store.putPrototype({ ...g.proto, brief: { ...g.proto.brief, attachments }, updatedAt: new Date().toISOString() });

  await audit(g.orgId, user?.name ?? user?.sub ?? "system", "brief.attach", g.proto.name,
    `${attachment.name} · ${(attachment.bytes / 1024).toFixed(0)} KB`).catch(() => null);

  return NextResponse.json({ attachment, attachments, duplicate: already });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const asset = req.nextUrl.searchParams.get("asset") ?? "";
  const g = await guardPrototypeAccess(key, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const meta = (g.proto.brief.attachments ?? []).find((a) => a.asset === asset);
  const found = meta ? await getBriefAttachment(g.proto.siteKey, asset) : null;
  if (!found || !meta) return NextResponse.json({ error: "No such file on this brief." }, { status: 404 });

  return new NextResponse(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.contentType || "application/octet-stream",
      // The bytes behind a content-addressed name never change.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${meta.name.replace(/"/g, "")}"`,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const asset = req.nextUrl.searchParams.get("asset") ?? "";
  const g = await guardPrototypeAccess(key, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const before = g.proto.brief.attachments ?? [];
  const attachments = before.filter((a) => a.asset !== asset);
  if (attachments.length === before.length) return NextResponse.json({ error: "No such file on this brief." }, { status: 404 });

  const store = await getContentStore();
  await store.putPrototype({ ...g.proto, brief: { ...g.proto.brief, attachments }, updatedAt: new Date().toISOString() });
  const user = await currentUser().catch(() => null);
  await audit(g.orgId, user?.name ?? user?.sub ?? "system", "brief.detach", g.proto.name, asset).catch(() => null);
  return NextResponse.json({ ok: true, attachments });
}
