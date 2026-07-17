import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { NextRequest, NextResponse } from "next/server";

const TYPE_BY_EXT: Record<string, string> = {
  css: "text/css",
  js: "text/javascript",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  mp4: "video/mp4",
  webm: "video/webm",
  json: "application/json",
};

/** Serve content-addressed assets from the snapshot pool. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteKey: string; file: string }> }
) {
  const { siteKey, file } = await params;
  // Content-addressed names only: <sha1>.<ext> — reject anything else
  if (!/^[a-f0-9]{40}\.[a-z0-9]{2,5}$/.test(file) || !/^[a-z0-9-]+$/.test(siteKey)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const path = join(process.cwd(), "snapshots", siteKey, "assets", basename(file));
  try {
    const buf = await readFile(path);
    const ext = file.split(".").pop() ?? "";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": TYPE_BY_EXT[ext] ?? "application/octet-stream",
        // Content-addressed → immutable forever
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
