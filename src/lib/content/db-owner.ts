/**
 * WHO OWNS THIS DATABASE.
 *
 * Two generations of the console now run side by side, and the only thing
 * separating their data is which connection string each deployment was given.
 * That is one checkbox in a dashboard, and getting it wrong is not a degraded
 * experience — it is a second deployment writing prototypes, audit rows and
 * users into the live one, and `ensureSchema()` running its nine `alter table`
 * statements against a database it does not own.
 *
 * So a deployment may DECLARE which database it expects, and the database
 * remembers who claimed it. The decision is a pure function of those two
 * strings so the promise that matters — "a deployment that has never heard of
 * this variable behaves exactly as it did before" — can be tested rather than
 * asserted. See docs/dev/db-owner-smoke.mts.
 */

export const DB_OWNER_KEY = "db-owner";

export type OwnershipAction =
  /** Unconfigured. Ensure the schema, claim nothing, check nothing. */
  | { kind: "legacy" }
  /** Declared, and this database already belongs to us. */
  | { kind: "own" }
  /** Declared, and nobody has claimed this database yet. */
  | { kind: "claim"; owner: string }
  /** Declared, and this database belongs to somebody else. Do not start. */
  | { kind: "refuse"; want: string; found: string };

/**
 * `declared` is PRISM_DB_OWNER as the deployment supplies it; `claimed` is
 * what the database says, or null when nothing has claimed it (including a
 * database so fresh it has no tables).
 *
 * UNSET IS LEGACY ON PURPOSE. The point of the guard is to protect the
 * running generation, and a guard that takes it down on the way in has done
 * the exact damage it was added to prevent. Whitespace-only counts as unset,
 * because a dashboard field cleared to a space is a person meaning "off".
 */
export function decideOwnership(declared: string | undefined | null, claimed: string | null): OwnershipAction {
  const owner = (declared ?? "").trim();
  if (!owner) return { kind: "legacy" };
  const held = (claimed ?? "").trim();
  if (!held) return { kind: "claim", owner };
  if (held === owner) return { kind: "own" };
  return { kind: "refuse", want: owner, found: held };
}

/** Loud, and it names the fix. Whoever meets this has two deployments and one
 *  database, which is the only shape in which it can happen. */
export function wrongDatabase(want: string, found: string): Error {
  return new Error(
    `This deployment declares PRISM_DB_OWNER="${want}" but the database it was given is claimed by "${found}". ` +
      `Two generations of the console are pointed at one database. Give this deployment its own DATABASE_URL ` +
      `(or correct PRISM_DB_OWNER if it really should own this one). Refusing to start rather than write into "${found}".`,
  );
}
