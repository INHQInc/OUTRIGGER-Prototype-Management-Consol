/**
 * WHEN SOMEONE ELSE'S SERVICE FAILS, SAY SO — and say whose.
 *
 * Every route here funnels its errors into one catch that answered
 * `{ error: (e as Error).message }` with status 400. Three things were thrown
 * away by that line: which service failed, what IT said, and the fact that the
 * request was fine and an upstream was not.
 *
 * On 22 Sep an expired `ANTHROPIC_API_KEY` on staging surfaced in the browser
 * console as a bare `400 (Bad Request)` on /api/prototypes/results, repeated
 * forty times by a retrying component. Nothing named Anthropic. Nothing said
 * 401. Narrowing it down — past a stale bundle, a mis-keyed taxonomy row and
 * two wrong API keys — took about an hour, and the answer had been sitting in
 * the response body the whole time as `401 {"type":"authentication_error"}`.
 *
 * It also went to the USER as that raw JSON string. A hotel executive opening
 * the readout would have read a stringified Anthropic error.
 *
 * DETECTION IS BY `name`, NEVER `instanceof`. The same file can resolve to two
 * module instances under different specifiers — `@/lib/...` and a relative
 * path — giving two distinct classes, and an instanceof in the catch then
 * quietly returns false. That is not hypothetical: it was measured here the
 * same day, and it is why OptimizelyError and GitError now set `this.name`.
 */

/** What an upstream said, in the two registers that matter. */
export type UpstreamFailure = {
  /** Named so a person can act: "the Claude API", not "upstream". */
  service: string;
  /** The status THEY returned. 0 when the console never got as far as calling. */
  status: number;
  /** For the reader: what happened and what to do about it. No JSON. */
  human: string;
  /** For whoever is debugging: exactly what came back, truncated. */
  detail: string;
};

const CONFIG = 0;

function credentialAdvice(service: string, status: number): string | null {
  if (status === 401 || status === 403) {
    return `${service} rejected this deployment's credentials. The key is set but not accepted — check it is the right key for this tier, that it has not been revoked, and that its scope covers this workspace or project.`;
  }
  if (status === 429) return `${service} is rate-limiting this deployment. Nothing is wrong with the request; try again shortly.`;
  if (status >= 500) return `${service} is failing on their side (${status}). The request was fine; there is nothing to fix here.`;
  return null;
}

/**
 * Recognise a failure that belongs to someone else's service.
 *
 * Returns null for our own bugs — a TypeError, a bad assumption, anything
 * without an upstream status. Those keep the old 400 and the old message,
 * because inventing a service name for them would be worse than saying
 * nothing.
 */
export function describeUpstream(e: unknown): UpstreamFailure | null {
  if (typeof e !== "object" || e === null) return null;
  const err = e as { name?: string; message?: string; status?: unknown };
  const message = typeof err.message === "string" ? err.message : "";
  const detail = message.slice(0, 400);
  const status = typeof err.status === "number" ? err.status : undefined;

  const named = (service: string, s: number): UpstreamFailure => ({
    service,
    status: s,
    detail,
    human:
      s === CONFIG
        ? `${service} is not configured for this deployment. ${detail}`
        : credentialAdvice(service, s) ?? `${service} refused the request (${s}). ${detail}`,
  });

  // The console's own typed clients. Both carry the status the service gave.
  if (err.name === "OptimizelyError") return named("Optimizely", status ?? CONFIG);
  if (err.name === "GitError") return named("GitHub", status ?? CONFIG);

  // The Anthropic SDK's APIError stringifies as "<status> <body>" and carries a
  // numeric status. Matched on that shape rather than on a class identity that
  // does not survive the module boundary.
  if (status !== undefined && /^\d{3}\s/.test(message)) {
    const service = /anthropic|x-api-key|"type":\s*"(authentication|invalid_request|rate_limit|overloaded)_error"/i.test(message)
      ? "The Claude API"
      : "An upstream service";
    return named(service, status);
  }

  return null;
}
