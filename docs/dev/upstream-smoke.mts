/**
 * WHOSE FAILURE WAS IT — asserted with the real errors that caused the outage.
 *
 *     npx tsx docs/dev/upstream-smoke.mts
 *
 * The literal strings below are what actually came back on 22 Sep. They are
 * quoted rather than paraphrased so this test fails if a provider changes its
 * shape, instead of passing against a tidy invention.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describeUpstream } from "../../src/lib/upstream";
import { OptimizelyError } from "../../src/lib/optimizely/api";
import { GitError } from "../../src/lib/git/github";

let failures = 0;
const ok = (label: string, cond: boolean, detail?: string) => {
  if (cond) return console.log(`  ok   ${label}`);
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
};

/** Exactly what the Anthropic SDK threw when staging's key was rejected. */
const anthropic401 = Object.assign(
  new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_011CfK6V"}'),
  { status: 401 },
);
/** And when the key was valid but scoped to the organization, not a workspace. */
const anthropic400 = Object.assign(
  new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"This API key is not scoped to a workspace..."}}'),
  { status: 400 },
);

console.log("\n1. the outage that caused this file");
const a = describeUpstream(anthropic401);
ok("recognised as an upstream failure at all", a !== null);
ok("named as the Claude API", a?.service === "The Claude API", String(a?.service));
ok("carries THEIR status, not ours", a?.status === 401, String(a?.status));
ok("the reader gets prose, not JSON", Boolean(a && !a.human.includes('{"type"')), a?.human);
ok("...that says what to do", Boolean(a?.human.includes("revoked") || a?.human.includes("scope")), a?.human);
ok("the debugger still gets the raw body", Boolean(a?.detail.includes("invalid x-api-key")));

const b = describeUpstream(anthropic400);
ok("the workspace-scope error is also theirs, not a bad request", b?.service === "The Claude API" && b?.status === 400);

console.log("\n2. the console's own typed clients, by name and not by instanceof");
// Two module instances of one file give two classes; instanceof then returns
// false across the boundary. Measured here the same day, in profile.ts.
ok("Optimizely", describeUpstream(new OptimizelyError(403, "Optimizely 403: forbidden"))?.service === "Optimizely");
ok("GitHub", describeUpstream(new GitError(404, "GitHub 404: Not Found"))?.service === "GitHub");
ok("a status of 0 reads as configuration, not as a refusal",
   describeUpstream(new OptimizelyError(0, "OPTIMIZELY_API_TOKEN is not set"))?.human.includes("not configured") === true);

// A name-carrying error must survive being re-thrown as a plain shape.
const acrossBoundary = { name: "GitError", message: "GitHub 401: Bad credentials", status: 401 };
ok("recognised from a foreign module instance", describeUpstream(acrossBoundary)?.service === "GitHub");

console.log("\n3. OUR bugs stay ours");
// The dangerous failure mode of this file would be blaming a provider for a
// TypeError. Better to say nothing than to send someone to check a key that
// was fine.
ok("a TypeError is not an upstream", describeUpstream(new TypeError("x is not a function")) === null);
ok("a plain Error is not an upstream", describeUpstream(new Error("Couldn't derive a verdict to stamp.")) === null);
ok("a message that merely starts with digits is not", describeUpstream(new Error("404 pages were crawled")) === null);
ok("null/undefined are not", describeUpstream(null) === null && describeUpstream(undefined) === null);

console.log("\n4. the route answers with it");
const route = readFileSync(join(process.cwd(), "src/app/api/prototypes/results/route.ts"), "utf8");
ok("the results route asks whose failure it was", /describeUpstream\(e\)/.test(route));
ok("...and answers 502, not 400", /status:\s*502/.test(route),
   "400 says the caller sent something wrong; an expired key upstream is not that");
ok("...naming the service in the body", /service:\s*upstream\.service/.test(route));
ok("...and the upstream's own status", /upstreamStatus:\s*upstream\.status/.test(route));
// The fallback must stay: a service name we cannot justify is worse than none.
ok("an unrecognised error still falls through to the old shape", /error: \(e as Error\)\.message \}, \{ status: 400 \}/.test(route));

console.log("\n5. the typed errors are identifiable at runtime");
ok("OptimizelyError sets its name", new OptimizelyError(1, "x").name === "OptimizelyError");
ok("GitError sets its name", new GitError(1, "x").name === "GitError");

console.log(failures === 0 ? "\nAn upstream failure says whose it was.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
