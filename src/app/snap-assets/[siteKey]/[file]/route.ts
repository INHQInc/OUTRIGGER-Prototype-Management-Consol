import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";

/** Serve content-addressed assets (<sha1>.<ext>) from the content store. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteKey: string; file: string }> }
) {
  const { siteKey, file } = await params;
  // Content-addressed names only: <sha1>.<ext> — reject anything else
  if (!/^[a-f0-9]{40}\.[a-z0-9]{2,5}$/.test(file) || !/^[a-z0-9-]+$/.test(siteKey)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const store = await getContentStore();
  const asset = await store.getAsset(siteKey, file);
  if (!asset) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(asset.bytes), {
    headers: {
      "Content-Type": asset.contentType || "application/octet-stream",
      // Content-addressed → immutable forever
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
