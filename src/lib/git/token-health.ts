/**
 * Token health — the write-probe plus expiry, on a schedule.
 *
 * A GitHub token fails in three silent ways: it loses write (scope change,
 * repo went private), it expires (fine-grained PATs have hard expiries — the
 * header is the only warning GitHub gives), or it's revoked. Every one of
 * them surfaces today as a mysterious 403 at build time. This makes the state
 * a stored fact, refreshed daily by cron and on demand, and surfaced as a
 * banner BEFORE it breaks a build.
 */
import { getContentStore } from "../content/store";
import { getGitClientForOrg, probeRepoWrite } from "./connection";
import { defaultOrgRepo } from "./org-repos";

export interface TokenHealth {
  at: string;
  ok: boolean;                 // healthy: valid + can write + not near expiry
  level: "ok" | "warn" | "danger";
  summary: string;             // one banner-ready sentence
  login?: string;
  canWrite?: boolean | null;   // null = no prototypes repo registered to probe
  repo?: string;
  expiresAt?: string | null;
  daysLeft?: number | null;
}

const KEY = (orgId: string) => `tokenhealth:${orgId}`;
const WARN_DAYS = 14;

export async function getTokenHealth(orgId: string): Promise<TokenHealth | null> {
  const raw = await (await getContentStore()).getFlag(KEY(orgId));
  if (!raw) return null;
  try { return JSON.parse(raw) as TokenHealth; } catch { return null; }
}

export async function runTokenHealth(orgId: string): Promise<TokenHealth> {
  const store = await getContentStore();
  const client = await getGitClientForOrg(orgId);
  let health: TokenHealth;

  if (!client) {
    health = { at: new Date().toISOString(), ok: false, level: "danger", summary: "No GitHub credential — connect one in Settings → Repositories.", canWrite: null };
  } else {
    try {
      const info = await client.getTokenInfo();
      const daysLeft = info.expiresAt ? Math.floor((new Date(info.expiresAt).getTime() - Date.now()) / 86_400_000) : null;
      const repo = await defaultOrgRepo(orgId, "prototypes");
      const probe = repo ? await probeRepoWrite(orgId, repo.fullName) : null;

      if (daysLeft !== null && daysLeft < 0) {
        health = { at: new Date().toISOString(), ok: false, level: "danger", summary: `The GitHub token expired ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago — builds and provisioning are broken until it's replaced.`, login: info.login, canWrite: false, repo: repo?.fullName, expiresAt: info.expiresAt, daysLeft };
      } else if (probe && probe.canWrite === false) {
        health = { at: new Date().toISOString(), ok: false, level: "danger", summary: `The GitHub token can't write to ${probe.repo}${probe.reason ? ` — ${probe.reason}` : ""}.`, login: info.login, canWrite: false, repo: probe.repo, expiresAt: info.expiresAt, daysLeft };
      } else if (daysLeft !== null && daysLeft <= WARN_DAYS) {
        health = { at: new Date().toISOString(), ok: false, level: "warn", summary: `The GitHub token expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${new Date(info.expiresAt as string).toLocaleDateString()}). Rotate it in Settings → Repositories before builds start failing.`, login: info.login, canWrite: probe?.canWrite ?? null, repo: repo?.fullName, expiresAt: info.expiresAt, daysLeft };
      } else {
        health = { at: new Date().toISOString(), ok: true, level: "ok", summary: `GitHub token healthy${repo ? ` — write verified on ${repo.fullName}` : ""}${daysLeft !== null ? ` · expires in ${daysLeft} days` : ""}.`, login: info.login, canWrite: probe?.canWrite ?? null, repo: repo?.fullName, expiresAt: info.expiresAt, daysLeft };
      }
    } catch (e) {
      health = { at: new Date().toISOString(), ok: false, level: "danger", summary: `GitHub rejected the token (${(e as Error).message.slice(0, 120)}) — reconnect it in Settings → Repositories.`, canWrite: false };
    }
  }
  await store.setFlag(KEY(orgId), JSON.stringify(health));
  return health;
}
