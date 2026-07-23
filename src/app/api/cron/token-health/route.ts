import { NextRequest, NextResponse } from "next/server";
import { listOrgs } from "@/lib/orgs";
import { runTokenHealth } from "@/lib/git/token-health";

export const maxDuration = 120;

/**
 * Daily cron (vercel.json): refresh every customer's GitHub token health so
 * expiry/write problems surface as banners days before they break a build.
 * Vercel invokes with `Authorization: Bearer ${CRON_SECRET}` when the env var
 * is set. Fail-closed when the secret exists; open only if it's unset (dev).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgs = await listOrgs();
  const results: Record<string, { level: string; summary: string }> = {};
  for (const org of orgs) {
    try {
      const h = await runTokenHealth(org.id);
      results[org.id] = { level: h.level, summary: h.summary };
    } catch (e) {
      results[org.id] = { level: "danger", summary: (e as Error).message.slice(0, 160) };
    }
  }
  return NextResponse.json({ ran: new Date().toISOString(), orgs: results });
}
