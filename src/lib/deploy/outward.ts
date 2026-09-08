/**
 * OUTWARD EFFECTS — the co-hosting guard.
 *
 * Two generations of this console now run side by side. They can be given
 * separate databases, but a database is not the boundary that matters: the
 * dangerous surface is everything that reaches OUT of the deployment and
 * cannot be taken back.
 *
 *   - email  — `sendEmail` had no environment check at all, and vercel.json
 *              runs the reports cron on EVERY deployment. A second deployment
 *              with the same mail credentials sends real customers a duplicate
 *              weekly readout from a development build.
 *   - experiment writes — createExperiment / setVariationCode PATCH land in the
 *              customer's live Optimizely project.
 *   - code writes — branch + commit into the shared prototypes repo, where two
 *              deployments provisioning `prototype/<key>` collide.
 *
 * So outward effects are OPT-IN, per deployment, and explicit:
 *
 *   PRISM_OUTWARD_EFFECTS=live      everything is permitted (the operational one)
 *   PRISM_OUTWARD_EFFECTS=code      code writes only — a build lane with no
 *                                   email and no traffic changes
 *   unset / anything else           blocked
 *
 * Explicit rather than inferred from VERCEL_ENV, because Beta 2 will eventually
 * be a production deployment of its own and would inherit permission it should
 * not have. Unset fails LOUD with the variable to set — a stopped report is
 * recoverable, a duplicate one sent to a customer is not.
 */

export type OutwardEffect = "email" | "experiment-write" | "code-write";

const MODE = (process.env.PRISM_OUTWARD_EFFECTS ?? "").trim().toLowerCase();

const PERMITTED: Record<string, OutwardEffect[]> = {
  live: ["email", "experiment-write", "code-write"],
  code: ["code-write"],
};

export function outwardAllowed(effect: OutwardEffect): boolean {
  return (PERMITTED[MODE] ?? []).includes(effect);
}

/** The refusal a caller shows or throws. Names the variable, so the fix is
 *  obvious to whoever meets it — including someone who has never read this file. */
export function outwardBlockedReason(effect: OutwardEffect): string | null {
  if (outwardAllowed(effect)) return null;
  const channel = process.env.NEXT_PUBLIC_RELEASE_CHANNEL?.trim() || "this deployment";
  const what =
    effect === "email" ? "Sending mail"
    : effect === "experiment-write" ? "Writing to the experimentation platform"
    : "Writing to the code host";
  return `${what} is turned off on ${channel}. Two deployments share the customer's mail, platform and repo, so outward effects are opt-in: set PRISM_OUTWARD_EFFECTS=live on the deployment that owns them (or =code for a build-only lane).`;
}

/** Throwing form, for a code path with no useful degraded behaviour. */
export function assertOutwardAllowed(effect: OutwardEffect): void {
  const reason = outwardBlockedReason(effect);
  if (reason) throw new Error(reason);
}
