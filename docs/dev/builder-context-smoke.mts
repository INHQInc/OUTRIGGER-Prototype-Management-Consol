/**
 * WHAT THE BUILDING AGENT IS TOLD ABOUT THE PAGE IT IS BUILDING ON.
 *
 *     npx tsx docs/dev/builder-context-smoke.mts
 *
 * The console verifies, per page, whether the loader tag is actually there
 * (`TargetInjection`). It then threw that away at the context mapper, so on an
 * untagged environment `?opmc` rendered nothing, `/api/loader/status` looked
 * healthy, and the agent debugged its own correct code. The console knew the
 * whole time and did not say.
 *
 * Two halves, and both are needed. DELIVERY puts the verdict on the branch.
 * STALENESS makes fixing the tag re-provision — without it the agent reads
 * yesterday's "renders nothing here" forever, which is worse than silence
 * because it is confidently wrong.
 *
 * The second half of the file covers the CUSTOMER seam: `provision.ts` imported
 * nothing from `../brand` until 22 Sep, so the surface that writes words onto a
 * customer's live page had none of the customer's words.
 *
 * Writes throwaway rows under a throwaway org, in its own sandbox. Refuses to
 * run against a database.
 */
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.DATABASE_URL) {
  console.error("\nRefusing to run: DATABASE_URL is set. This suite writes throwaway rows.\n" +
    "Run it as:  env -u DATABASE_URL npx tsx docs/dev/builder-context-smoke.mts\n");
  process.exit(2);
}
const SANDBOX = mkdtempSync(join(tmpdir(), "prism-builder-"));
process.chdir(SANDBOX);
process.on("exit", () => rmSync(SANDBOX, { recursive: true, force: true }));

const { contentHashOf, renderBriefMd } = await import("../../src/lib/prototypes/provision");
const { customerContextFor, renderCustomerMd, brandBasis } = await import("../../src/lib/prototypes/customer-context");
const { isTaxonomyUnavailable } = await import("../../src/lib/brand/profile");
const { getContentStore } = await import("../../src/lib/content/store");
const { EMPTY_OBSERVED } = await import("../../src/lib/brand/types");
type PrototypeRecord = import("../../src/lib/prototypes/types").PrototypeRecord;
type SiteProfile = import("../../src/lib/brand/types").SiteProfile;

let failures = 0;
const ok = (label: string, cond: boolean, detail?: string) => {
  if (cond) return console.log(`  ok   ${label}`);
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
};

const SRC = readFileSync(new URL("../../src/lib/prototypes/provision.ts", import.meta.url), "utf8");

function proto(targets: PrototypeRecord["targets"]): PrototypeRecord {
  return {
    key: "demo", name: "Demo", siteKey: "site", orgId: "org", status: "draft",
    brief: { change: "something", doneLooksLike: "it works" },
    hypothesis: { change: "", audience: "", outcome: "", rationale: "" },
    metrics: { primary: "clicks", guardrails: [] },
    targets, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as PrototypeRecord;
}

/** One brand revision held fixed, so sections 1–2 measure the record alone. */
const hash = (p: PrototypeRecord) => contentHashOf(p, "org:1");

console.log("\n1. fixing a missing loader tag stales the branch");
{
  const url = "https://example.com/a";
  const absent = proto([{ url, source: "live", injection: { state: "absent", at: "2026-01-01T00:00:00.000Z" } }]);
  const present = proto([{ url, source: "live", injection: { state: "present", at: "2026-01-01T00:00:00.000Z" } }]);
  const unchecked = proto([{ url, source: "live" }]);
  ok("absent ≠ present", hash(absent) !== hash(present));
  ok("unchecked ≠ present", hash(unchecked) !== hash(present));
  ok("same state is stable", hash(absent) === hash(proto([{ url, source: "live", injection: { state: "absent", at: "2026-06-06T00:00:00.000Z" } }])),
    "only the STATE is a build input — re-checking and finding the same answer must not churn the branch");
}

console.log("\n2. the page list still decides staleness on its own");
{
  const a = proto([{ url: "https://example.com/a", source: "live" }]);
  const b = proto([{ url: "https://example.com/b", source: "live" }]);
  ok("a different page ≠ same page", hash(a) !== hash(b));
  ok("order does not matter", hash(proto([
    { url: "https://example.com/a", source: "live" }, { url: "https://example.com/b", source: "live" },
  ])) === hash(proto([
    { url: "https://example.com/b", source: "live" }, { url: "https://example.com/a", source: "live" },
  ])));
}

const brief = (targets: PrototypeRecord["targets"]) =>
  renderBriefMd(proto(targets), new Map(), "https://console.example", "2026-09-22T00:00:00.000Z");
const tgt = (state?: string) => [{ url: "https://example.com/a", source: "live" as const,
  ...(state ? { injection: { state, at: "2026-01-01T00:00:00.000Z" } } : {}) }] as PrototypeRecord["targets"];

console.log("\n3. the verdict reaches both files the agent reads");
{
  ok("context.json carries it", /injection:\s*\{\s*state:/.test(SRC),
    "the context mapper must emit targets[].injection");
  const md = brief(tgt("absent"));
  ok("brief.md has the column", md.includes("| Loader tag |"), "context.json is not what a person opens");
  ok("...and the verdict in it", /ABSENT/.test(md));
  ok("an untagged page gets an instruction, not just a state", md.includes("renders nothing"),
    "\"absent\" without \"so your build cannot appear\" is a fact the reader has to interpret");
  ok("the failing page is NAMED", md.includes("`https://example.com/a`"),
    "on a three-page prototype, \"a page\" sends the agent to check all three");
}

console.log("\n3b. PROVEN BROKEN is not the same as NOBODY LOOKED");
{
  // The gate was `!injectionPasses(t)`, which is false for "never checked" and
  // for "unreachable" too — so every FIRST provision told the agent flatly that
  // its page could not show the build. The same confidently-wrong failure this
  // warning exists to prevent, pointed the other way.
  const HARD = "cannot show your build";
  const unchecked = brief(tgt());
  ok("a never-checked page raises no alarm", !unchecked.includes(HARD), "this is EVERY first provision");
  ok("...but is not silent either", /nobody has checked/.test(unchecked));
  ok("an unreachable page raises no alarm", !brief(tgt("unreachable")).includes(HARD));
  for (const state of ["absent", "wrong-env"]) {
    ok(`"${state}" DOES raise the alarm`, brief(tgt(state)).includes(HARD));
  }
  ok("a verified page says nothing at all", !brief(tgt("present")).includes("loader tag yet"));
}

console.log("\n4. the check timestamp is deliberately NOT delivered");
{
  // It would be written at commit time and then sit still until something else
  // staled the branch, so a three-day-old "checked just now" is the likelier
  // reading. If this fails, someone added it back: the console holds recency.
  const ctxBlock = SRC.slice(SRC.indexOf("injection: { state:"), SRC.indexOf("injection: { state:") + 240);
  ok("no `at` in the delivered payload", !/\bat\s*:/.test(ctxBlock), ctxBlock.slice(0, 120));
}

console.log("\n5. correcting the customer's words stales every branch written in the old ones");
{
  const t = proto([{ url: "https://example.com/a", source: "live" }]);
  ok("a new profile revision ≠ the old one", contentHashOf(t, "org:1") !== contentHashOf(t, "org:2"));
  ok("no profile ≠ some profile", contentHashOf(t, null) !== contentHashOf(t, "org:1"));
  ok("the same revision is stable", contentHashOf(t, "org:2") === contentHashOf(t, "org:2"));
}

console.log("\n6. an undescribed customer cannot be provisioned at all");
{
  let refused = false, kind = "";
  try { await customerContextFor("nobody-here"); } catch (e) { refused = isTaxonomyUnavailable(e); kind = (e as Error).message; }
  ok("refuses rather than defaulting", refused, kind.slice(0, 100));
  ok("it refuses BEFORE the branch is touched",
    SRC.indexOf("customerContextFor(orgId)") < SRC.indexOf("client.getBranchSha("),
    "failing after createBranch leaves a half-provisioned branch behind");
  ok("the refusal names the fix", /seed-taxonomy|brand profile/.test(SRC.slice(SRC.indexOf("customerContextFor(orgId)"), SRC.indexOf("customerContextFor(orgId)") + 700)));
}

console.log("\n7. a described customer gets its own words, never the neutral defaults");
{
  const store = await getContentStore();
  const now = "2026-09-22T00:00:00.000Z";
  await store.addSiteProfile({
    id: "cust-org-star-r1", orgId: "cust-org", siteId: "*", rev: 1, status: "approved",
    taxonomy: { visitorNoun: "rider", visitorNounPlural: "riders", offeringNoun: "route",
      offeringNounPlural: "routes", primaryAction: "book a ride", conversionSurface: "ride sheet",
      entityKinds: ["trail", "clinic"] },
    sections: { voice: "Plain, specific, never breathless." },
    observed: { ...EMPTY_OBSERVED }, sources: { urls: [], derivedAt: now, crawler: "test" },
    corrections: [], createdAt: now, approvedAt: now,
  } as SiteProfile);

  const c = await customerContextFor("cust-org");
  const md = renderCustomerMd(c, now);
  ok("the customer's nouns are in the file", md.includes("rider") && md.includes("route") && md.includes("ride sheet"));
  ok("its entity kinds reach the builder", md.includes("trail") && md.includes("clinic"));
  ok("the approved voice is delivered verbatim", md.includes("never breathless"));
  // THE WHOLE POINT. If any of these appear, a neutral default leaked into a
  // file that decides what a real customer's page says.
  for (const generic of ["visitor", "product", "checkout", "convert"]) {
    ok(`no neutral "${generic}" leaked in`, !md.toLowerCase().includes(generic));
  }
  ok("the revision is recorded next to the words", md.includes("org:1") && c.profileRev === "org:1");
  ok("brandBasis agrees with the delivered revision", (await brandBasis("cust-org")) === c.profileRev,
    "the hash and the file must describe the same revision or Re-sync never clears");
}

console.log("\n8. an uncharacterized section still carries an instruction");
{
  // Silence reads as freedom, and a model with freedom and no voice description
  // writes generic marketing copy — which is the failure this whole line of
  // work exists to remove. So a gap points at the evidence on the page.
  const c = await customerContextFor("cust-org");
  const md = renderCustomerMd(c, "2026-09-22T00:00:00.000Z");
  ok("the missing audience section is named as missing", md.includes("Not characterized yet"));
  ok("and says what to do instead", /brief.s audience line/.test(md));
  ok("a section that IS written gets no gap text", !md.split("## How it sounds")[1]?.startsWith("\nNot characterized"));
}

console.log("\n9. a remedy that does not work is worse than no remedy");
{
  // The first version of this refusal named two fixes and both were wrong: a
  // console screen that does not exist, and `--dry`, which is the flag that
  // writes NOTHING. A user follows it, sees exit 0, re-syncs, and gets the
  // identical error with nothing explaining why.
  const msg = SRC.slice(SRC.indexOf("This customer has no usable brand profile"), SRC.indexOf("This customer has no usable brand profile") + 600);
  ok("does not send the user to a dry run", !msg.includes("--dry"));
  ok("names the actual org, not a placeholder", msg.includes("${orgId}") && !msg.includes("<org>"),
    "a guessed org id is how a row keyed `outrigger` instead of `outrigger-resorts-hotels` cost a day");
  ok("is honest that no screen exists yet", /no onboarding screen/.test(msg));
}

console.log("\n10. the loader-tag warning is not swallowed by the table above it");
{
  // `.filter(Boolean)` eats the array's blank-line separators. That is safe
  // while every following line is a heading — a heading ends a GFM table — and
  // this warning is a paragraph, so without a blank line before it GFM parses
  // it as one more table row and renders it inside the first column.
  const lines = brief(tgt("absent")).split("\n");
  const i = lines.findIndex((l) => l.includes("cannot show your build"));
  ok("there is a blank line between the table and the warning", i > 0 && lines[i - 1].trim() === "",
    `previous line: ${JSON.stringify(lines[i - 1])}`);
}

console.log("\n11. a card blocked on a missing profile says so, instead of blaming the brief");
{
  // Without this the console says "The brief or pages changed ... Re-sync",
  // and Re-sync returns 400 because provisioning refuses without a profile.
  // The warning is then permanent and names the wrong cause: the user edits
  // the brief, re-syncs, fails, and has nothing to go on.
  const { derivePipeline } = await import("../../src/lib/prototypes/pipeline");
  const p = proto(tgt());
  const stale = JSON.stringify({ contentHash: "deadbeefdeadbeef", provisionedAt: "2026-01-01T00:00:00.000Z" });
  const base = { proto: p, provisionFlagRaw: stale, source: null, versions: [], lastPush: null } as never;

  const noProfile = derivePipeline({ ...(base as object), brandRev: null } as never);
  const hit = noProfile.alerts.find((a) => /brand profile/.test(a.text));
  ok("the alert names the missing profile", Boolean(hit));
  ok("...at danger, not warn", hit?.level === "danger", "a permanently stuck card is not a nudge");
  ok("...and does not also blame the brief", !noProfile.alerts.some((a) => /brief or pages changed/.test(a.text)),
    "two alerts for one cause sends the user to edit a brief that is fine");

  const seeded = derivePipeline({ ...(base as object), brandRev: "org:1" } as never);
  ok("a seeded customer still gets the ordinary re-sync nudge",
    seeded.alerts.some((a) => /brief or pages changed/.test(a.text)));
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
