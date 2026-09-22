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
 * Pure: no database, no network. `contentHashOf` is a function of the record.
 */
import { readFileSync } from "node:fs";

const { contentHashOf } = await import("../../src/lib/prototypes/provision");
type PrototypeRecord = import("../../src/lib/prototypes/types").PrototypeRecord;

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

console.log("\n1. fixing a missing loader tag stales the branch");
{
  const url = "https://example.com/a";
  const absent = proto([{ url, source: "live", injection: { state: "absent", at: "2026-01-01T00:00:00.000Z" } }]);
  const present = proto([{ url, source: "live", injection: { state: "present", at: "2026-01-01T00:00:00.000Z" } }]);
  const unchecked = proto([{ url, source: "live" }]);
  ok("absent ≠ present", contentHashOf(absent) !== contentHashOf(present));
  ok("unchecked ≠ present", contentHashOf(unchecked) !== contentHashOf(present));
  ok("same state is stable", contentHashOf(absent) === contentHashOf(proto([{ url, source: "live", injection: { state: "absent", at: "2026-06-06T00:00:00.000Z" } }])),
    "only the STATE is a build input — re-checking and finding the same answer must not churn the branch");
}

console.log("\n2. the page list still decides staleness on its own");
{
  const a = proto([{ url: "https://example.com/a", source: "live" }]);
  const b = proto([{ url: "https://example.com/b", source: "live" }]);
  ok("a different page ≠ same page", contentHashOf(a) !== contentHashOf(b));
  ok("order does not matter", contentHashOf(proto([
    { url: "https://example.com/a", source: "live" }, { url: "https://example.com/b", source: "live" },
  ])) === contentHashOf(proto([
    { url: "https://example.com/b", source: "live" }, { url: "https://example.com/a", source: "live" },
  ])));
}

console.log("\n3. the verdict reaches both files the agent reads");
{
  ok("context.json carries it", /injection:\s*\{\s*state:/.test(SRC),
    "the context mapper must emit targets[].injection");
  ok("brief.md carries it", SRC.includes("injectionNote(t)") && SRC.includes("| Loader tag |"),
    "the human-readable table needs the column too — context.json is not what a person opens");
  ok("an untagged page gets an instruction, not just a state", SRC.includes("renders nothing"),
    "\"absent\" without \"so your build cannot appear\" is a fact the reader has to interpret");
}

console.log("\n4. the check timestamp is deliberately NOT delivered");
{
  // It would be written at commit time and then sit still until something else
  // staled the branch, so a three-day-old "checked just now" is the likelier
  // reading. If this fails, someone added it back: the console holds recency.
  const ctxBlock = SRC.slice(SRC.indexOf("injection: { state:"), SRC.indexOf("injection: { state:") + 240);
  ok("no `at` in the delivered payload", !/\bat\s*:/.test(ctxBlock), ctxBlock.slice(0, 120));
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
