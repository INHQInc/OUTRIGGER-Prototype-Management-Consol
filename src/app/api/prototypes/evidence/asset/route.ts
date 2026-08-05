/**
 * Serves an evidence screenshot. Same access guard as the board itself — a
 * screenshot of a client's page is not public just because its name is a hash.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getEvidenceImage } from "@/lib/prototypes/evidence";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const name = req.nextUrl.searchParams.get("name") ?? "";
  const g = await guardPrototypeAccess(key, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const found = await getEvidenceImage(g.proto.siteKey, name);
  if (!found) return NextResponse.json({ error: "No such screenshot." }, { status: 404 });

  return new NextResponse(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.contentType || "application/octet-stream",
      // Content-addressed: the bytes behind a name never change.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
