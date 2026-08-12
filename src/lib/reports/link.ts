/**
 * THE READOUT LINK — the one thing in the email a recipient can click.
 *
 * "Open the full readout →" pointed at `/prototypes/<key>?tab=analytics`, which
 * is not public. Every executive who ever clicked it was redirected to a login
 * screen for a console they have no account on. The call to action has been
 * dead in every readout this system has sent.
 *
 * So the link carries its own authority: a short signed token naming exactly
 * one prototype, readable without a session and good for nothing else.
 *
 * WHAT THIS IS NOT. It is not a login, it grants no console access, and it
 * cannot be widened by editing the URL — the payload is signed, so a token for
 * one experiment cannot be edited into another. Anyone holding the link can
 * read that one readout, which is the same thing as holding the email.
 *
 * NO SECRET, NO LINK. If `READOUT_LINK_SECRET` is unset the email renders with
 * NO button at all rather than the old dead one. An absent affordance is
 * honest; one that leads to a login wall is not.
 */
import { SignJWT, jwtVerify } from "jose";

/** Ninety days. Long enough that last quarter's mail still opens, short enough
 *  that a forwarded link does not outlive the experiment by a year. Rotating
 *  the secret invalidates every link already sent — note it in the runbook. */
const MAX_AGE_DAYS = 90;

function secret(): Uint8Array | null {
  const raw = process.env.READOUT_LINK_SECRET?.trim();
  // Deliberately NOT falling back to AUTH_SECRET. That key signs 365-day
  // console sessions; a public, widely-forwarded token must not be minted with
  // the same material, and rotating one must not force rotating the other.
  if (!raw || raw.length < 16) return null;
  return new TextEncoder().encode(raw);
}

export function readoutLinksEnabled(): boolean {
  return secret() !== null;
}

/** Why the button is missing, in words a person can act on. */
export function readoutLinkUnavailableReason(): string | null {
  const raw = process.env.READOUT_LINK_SECRET?.trim();
  if (!raw) return "READOUT_LINK_SECRET isn't set on this deployment, so the readout has no shareable link.";
  if (raw.length < 16) return "READOUT_LINK_SECRET is too short to sign with — use at least 16 characters.";
  return null;
}

export interface ReadoutLinkClaims {
  orgId: string;
  prototypeKey: string;
}

export async function signReadoutLink(claims: ReadoutLinkClaims): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  return new SignJWT({ o: claims.orgId, k: claims.prototypeKey })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_DAYS}d`)
    .sign(key);
}

/** Null on anything wrong — bad signature, expired, wrong shape. The page says
 *  "this link has expired" either way; distinguishing the reasons for an
 *  anonymous visitor only helps someone probing it. */
export async function verifyReadoutLink(token: string | undefined): Promise<ReadoutLinkClaims | null> {
  const key = secret();
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const orgId = typeof payload.o === "string" ? payload.o : "";
    const prototypeKey = typeof payload.k === "string" ? payload.k : "";
    if (!orgId || !prototypeKey) return null;
    return { orgId, prototypeKey };
  } catch {
    return null;
  }
}

/** The absolute URL, or null when links are off. Callers pass `undefined` for
 *  `url` in that case and the renderer omits the button entirely. */
export async function readoutLinkUrl(baseUrl: string | undefined, claims: ReadoutLinkClaims): Promise<string | undefined> {
  if (!baseUrl) return undefined;
  const token = await signReadoutLink(claims);
  return token ? `${baseUrl}/r/${token}` : undefined;
}
