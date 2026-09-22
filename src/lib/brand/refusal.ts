/**
 * REFUSING IS RIGHT; A STACK TRACE IS NOT.
 *
 * `requireTaxonomy` throws when a customer has never been characterised, which
 * is a state of the ACCOUNT rather than a fault in the request — so it gets its
 * own status and words a person can act on, not the generic 400 that reads like
 * the request was malformed.
 *
 * ONE DERIVATION, because the refusal now reaches four surfaces. It lived
 * inline in the results route while `brief-draft` and `measurement` answered
 * every error with `400 ${e.message}` — so widening the gate to the brief
 * author and the measurement planner would have shipped the failure mode this
 * comment exists to prevent, on two routes at once.
 *
 * No `NextResponse` here on purpose: `lib/brand` should not know it is behind
 * an HTTP framework. The route wraps it.
 */
import { isTaxonomyUnavailable } from "./profile";

export interface Refusal {
  status: number;
  body: { error: string; reason: string };
}

/**
 * @param what the thing that could not be written, in the reader's words —
 *   "readout", "brief", "measurement plan". It completes the sentence
 *   "there are no words to write the ___ in".
 */
export function taxonomyRefusal(e: unknown, what: string): Refusal | null {
  if (!isTaxonomyUnavailable(e)) return null;
  // THREE REASONS, THREE ANSWERS. This was a ternary with two branches, so
  // "incomplete" — a customer described by halves, which is the likelier case
  // the moment onboarding exists — was answered with "that's a bug in the
  // console", sending the one person who could fix it to report it instead.
  const error =
    e.reason === "no-profile"
      ? `This customer hasn't been characterised yet, so there are no words to write the ${what} in. Run onboarding for the site, or seed the customer default, then try again.`
      : e.reason === "incomplete"
        // Its own message NAMES the missing fields, which is the whole value of
        // the per-field check — paraphrasing it here would throw that away.
        ? `${e.message} Fill those in, then try again.`
        : `No organisation was resolved for this request, so there is no vocabulary to write in. That's a bug in the console rather than something you can fix here — please report it.`;
  return { status: 409, body: { error, reason: e.reason } };
}
