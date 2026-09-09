/**
 * DB OWNERSHIP GATE — the promise being tested is a negative one:
 *
 *   a deployment that has never heard of PRISM_DB_OWNER behaves exactly as it
 *   did before the gate existed.
 *
 * That is the only property Beta 1 cares about, and it is the one that is easy
 * to break later by "tidying" the unset case into a default. Everything else
 * here guards the co-hosting behaviour Beta 2 depends on.
 *
 *   npx tsx docs/dev/db-owner-smoke.mts
 */

import { decideOwnership, wrongDatabase } from "../../src/lib/content/db-owner";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}\n       want ${w}\n       got  ${g}`);
  }
}

console.log("\nLEGACY — Beta 1 as it runs today. Nothing may change here.");
// Beta 1 production has no PRISM_DB_OWNER. Whatever the database says about
// ownership is irrelevant: an unconfigured deployment neither checks nor claims.
check("unset, database unclaimed", decideOwnership(undefined, null), { kind: "legacy" });
check("unset, database claimed by someone else", decideOwnership(undefined, "beta2"), { kind: "legacy" });
check("empty string is unset", decideOwnership("", "beta2"), { kind: "legacy" });
check("whitespace is unset", decideOwnership("   ", "beta2"), { kind: "legacy" });
check("null is unset", decideOwnership(null, "beta1"), { kind: "legacy" });

console.log("\nCLAIMING — a declared deployment adopts a database nobody holds.");
check("declared, unclaimed", decideOwnership("beta1", null), { kind: "claim", owner: "beta1" });
check("declared, claim is blank", decideOwnership("beta1", ""), { kind: "claim", owner: "beta1" });
check("declared, claim is whitespace", decideOwnership("beta1", "  "), { kind: "claim", owner: "beta1" });

console.log("\nOWNING — the ordinary steady state.");
check("declared, same tag", decideOwnership("beta1", "beta1"), { kind: "own" });
check("declared with padding, same tag", decideOwnership(" beta1 ", "beta1"), { kind: "own" });

console.log("\nREFUSING — the case the gate exists for.");
check("beta2 pointed at beta1's database", decideOwnership("beta2", "beta1"), {
  kind: "refuse",
  want: "beta2",
  found: "beta1",
});
check("tags are case-sensitive", decideOwnership("Beta1", "beta1"), {
  kind: "refuse",
  want: "Beta1",
  found: "beta1",
});

console.log("\nTHE REFUSAL NAMES THE FIX.");
const msg = wrongDatabase("beta2", "beta1").message;
for (const needle of ["PRISM_DB_OWNER", "DATABASE_URL", "beta2", "beta1", "Refusing to start"]) {
  check(`message mentions ${needle}`, msg.includes(needle), true);
}

console.log(failed === 0 ? "\nAll good.\n" : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
