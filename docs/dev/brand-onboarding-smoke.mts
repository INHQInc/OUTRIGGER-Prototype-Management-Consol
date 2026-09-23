/**
 * STEP ONE OF A CUSTOMER — describing its brand, and the promises that makes.
 *
 *     env -u DATABASE_URL npx tsx docs/dev/brand-onboarding-smoke.mts
 *
 * Until 23 Sep 2026 the only writer of a brand profile was a CLI script whose
 * allowlist held one customer, while provisioning refused to build without a
 * profile. So the build gate pointed at a remedy nobody else could use, and the
 * setup checklist could go fully green on a customer the console then refused.
 *
 * The Brand screen fixes that, and it makes four promises this suite holds it to:
 *   - a DRAFT is never served — half-written words cannot reach a branch
 *   - an APPROVED revision is never rewritten — editing makes the next one
 *   - an UNCHANGED approve makes no revision — or every prototype re-syncs for nothing
 *   - "ready" means exactly what the build gate means — the checklist cannot
 *     go green on a customer provisioning refuses
 *
 * Writes throwaway rows under a throwaway org, in its own sandbox. Refuses to
 * run against a database.
 */
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.DATABASE_URL) {
  console.error("\nRefusing to run: DATABASE_URL is set. This suite writes throwaway rows.\n" +
    "Run it as:  env -u DATABASE_URL npx tsx docs/dev/brand-onboarding-smoke.mts\n");
  process.exit(2);
}
const REPO = process.cwd();
const SANDBOX = mkdtempSync(join(tmpdir(), "prism-brand-"));
process.chdir(SANDBOX);
process.on("exit", () => rmSync(SANDBOX, { recursive: true, force: true }));

const { brandStatus, saveBrandDraft, approveBrand } = await import("../../src/lib/brand/onboarding");
const { requireTaxonomy, isTaxonomyUnavailable, taxonomyRevision, ORG_DEFAULT_SITE_ID } = await import("../../src/lib/brand/profile");
const { getContentStore } = await import("../../src/lib/content/store");

let failures = 0;
const ok = (label: string, cond: unknown, detail?: string) => {
  if (cond) return console.log(`  ok   ${label}`);
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
};
const src = (rel: string) => readFileSync(join(REPO, rel), "utf8");

/** Does the BUILD GATE accept this customer? The thing "ready" must agree with. */
async function gatePasses(org: string): Promise<boolean> {
  try { await requireTaxonomy(org); return true; } catch (e) { if (isTaxonomyUnavailable(e)) return false; throw e; }
}

const ORG = "acme";
// An invented customer, and deliberately not a hospitality one.
const WORDS = {
  visitorNoun: "member", visitorNounPlural: "members", offeringNoun: "plan", offeringNounPlural: "plans",
  primaryAction: "subscribe", conversionSurface: "sign-up form", entityKinds: "plans, integrations, case studies",
};

console.log("\n1. a new customer is not ready, and says exactly why");
{
  const s = await brandStatus(ORG);
  ok("not ready", !s.ready);
  ok("every vocabulary field is missing", s.missing.length === 7, JSON.stringify(s.missing));
  ok("...and the build gate agrees", !(await gatePasses(ORG)));
}

console.log("\n2. a DRAFT is never served");
{
  await saveBrandDraft(ORG, { taxonomy: { visitorNoun: "member", offeringNoun: "plan" } }, "tester");
  const s = await brandStatus(ORG);
  ok("the draft is kept", s.draft?.taxonomy.visitorNoun === "member");
  ok("...but nothing is live", s.approved === null && !s.ready);
  ok("...and the build gate still refuses", !(await gatePasses(ORG)),
    "a half-written brand must not reach a branch while someone is still typing");
}

console.log("\n3. approving an incomplete brand is refused, naming what is missing");
{
  const r = await approveBrand(ORG, "tester");
  ok("refused", !r.ok);
  ok("...naming the missing fields", !r.ok && r.missing.includes("primaryAction") && r.missing.includes("conversionSurface"),
    !r.ok ? r.error : "");
  ok("...and still not live", !(await gatePasses(ORG)));
}

console.log("\n4. a complete brand, approved, is what the builder reads");
{
  await saveBrandDraft(ORG, { taxonomy: WORDS, sections: { voice: "Plain, specific, never breathless.", audience: "", business: "  " } }, "tester");
  const r = await approveBrand(ORG, "tester");
  ok("approved", r.ok && r.changed, !r.ok ? r.error : "");
  const s = await brandStatus(ORG);
  ok("ready", s.ready && s.missing.length === 0);
  const t = await requireTaxonomy(ORG);
  ok("the build gate now resolves the customer's own words", t.visitorNoun === "member" && t.primaryAction === "subscribe");
  ok("entity kinds arrive as a list, trimmed", JSON.stringify(t.entityKinds) === JSON.stringify(["plans", "integrations", "case studies"]));
  ok("a stated section is kept verbatim", s.approved?.sections.voice === "Plain, specific, never breathless.");
  ok("a BLANK section is absent, not an empty answer",
    !("audience" in (s.approved?.sections ?? {})) && !("business" in (s.approved?.sections ?? {})),
    "blank means unknown — the branch then says to match the page rather than presenting '' as a voice");
}

console.log("\n5. an approved revision is never rewritten");
{
  const store = await getContentStore();
  const before = (await brandStatus(ORG)).approved!;
  const snapshot = JSON.stringify(before.taxonomy);

  await saveBrandDraft(ORG, { taxonomy: { visitorNoun: "subscriber", visitorNounPlural: "subscribers" } }, "tester");
  const mid = await brandStatus(ORG);
  ok("editing makes a draft at the NEXT revision", mid.draft?.rev === before.rev + 1, `${mid.draft?.rev} vs ${before.rev}`);
  ok("...the live words are unchanged while it waits", (await requireTaxonomy(ORG)).visitorNoun === "member");

  const r = await approveBrand(ORG, "tester");
  ok("approving it makes it live", r.ok && (await requireTaxonomy(ORG)).visitorNoun === "subscriber");

  const old = (await store.listSiteProfiles(ORG, ORG_DEFAULT_SITE_ID)).find((p) => p.rev === before.rev)!;
  ok("the previous revision still says exactly what it said", JSON.stringify(old.taxonomy) === snapshot,
    "a branch built on it must still be explainable a year later");
  ok("...and is marked superseded, not deleted", old.status === "superseded");
  ok("exactly one revision is live", (await store.listSiteProfiles(ORG, ORG_DEFAULT_SITE_ID)).filter((p) => p.status === "approved").length === 1);
}

console.log("\n6. approving without changing a word makes no revision");
{
  // The brand revision is part of every branch's content hash, so a new one
  // tells every prototype for this customer to re-sync. Opening the screen and
  // pressing Approve must not do that.
  const revBefore = await taxonomyRevision(ORG);
  await saveBrandDraft(ORG, { taxonomy: { visitorNoun: "subscriber" } }, "tester"); // same value
  const r = await approveBrand(ORG, "tester");
  ok("approved", r.ok);
  ok("...but reported as unchanged", r.ok && r.changed === false);
  ok("...and the revision did not move", (await taxonomyRevision(ORG)) === revBefore, `${revBefore} → ${await taxonomyRevision(ORG)}`);
  ok("...and no draft is left hanging", (await brandStatus(ORG)).draft === null);
}

console.log("\n7. \"ready\" means what the build gate means — for every state above");
{
  // Three customers, three states, one question each: does the checklist's
  // answer match the gate's? If they ever disagree the checklist goes green on
  // a customer provisioning refuses, which is the bug this screen exists to fix.
  await saveBrandDraft("half", { taxonomy: { visitorNoun: "reader" } }, "tester");
  for (const org of ["nobody", "half", ORG]) {
    ok(`${org}: checklist and build gate agree`, (await brandStatus(org)).ready === (await gatePasses(org)));
  }
}

console.log("\n8. step one is wired everywhere a person would start");
{
  const page = src("src/app/page.tsx");
  const first = page.slice(page.indexOf("const steps: SetupStep[] = ["), page.indexOf("const steps: SetupStep[] = [") + 900);
  ok("the setup checklist's FIRST step is the brand", /label: "Describe the brand"/.test(first) && first.indexOf("Describe the brand") < first.indexOf("environment"));
  ok("...and it is done exactly when the brand is ready", /done: brand\.ready/.test(first));
  ok("creating from the switcher lands on the brand", /router\.push\("\/brand"\)/.test(src("src/components/OrgSwitcher.tsx")));
  ok("creating from the customers list lands on the brand", /router\.push\("\/brand"\)/.test(src("src/components/CustomersManager.tsx")),
    "it used to stay on the list without switching, so the new customer's first screen was somebody else's dashboard");
  ok("the sidebar names it", /href: "\/brand"/.test(src("src/components/Sidebar.tsx")));
}

console.log("\n9. every refusal points at the screen, not at a script");
{
  // The build gate refused with a remedy only one customer could use. Each of
  // these is a message a person reads when something will not build.
  for (const f of ["src/lib/prototypes/provision.ts", "src/lib/brand/refusal.ts", "src/lib/prototypes/pipeline.ts", "src/lib/brand/profile.ts"]) {
    const s = src(f);
    const code = s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok(`${f.split("/").pop()} names the Brand screen`, code.includes("Configuration → Brand"));
    ok(`${f.split("/").pop()} no longer sends anyone to the seed script`, !code.includes("seed-taxonomy"));
  }
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
