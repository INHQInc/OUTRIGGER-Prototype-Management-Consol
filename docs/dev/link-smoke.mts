/**
 * THE PUBLIC READOUT LINK, asserted.
 *
 *     npx tsx docs/dev/link-smoke.mts
 *
 * This token is the only thing standing between a forwarded email and a
 * customer's experiment results, so the properties that matter are: it cannot
 * be edited to name a different experiment, it cannot be minted without the
 * secret, and its absence produces NO link rather than a broken one.
 */
process.env.READOUT_LINK_SECRET = "test-secret-at-least-16-chars-long";

const { signReadoutLink, verifyReadoutLink, readoutLinksEnabled, readoutLinkUrl, readoutLinkUnavailableReason } =
  await import("../../src/lib/reports/link.ts");

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`  ✗ ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`  ✓ ${label}`);
};

console.log("Round trip");
check("enabled with a secret", readoutLinksEnabled(), true);
check("no complaint to make", readoutLinkUnavailableReason(), null);

const claims = { orgId: "outrigger", prototypeKey: "room-detail-overlay" };
const token = await signReadoutLink(claims);
check("a token is minted", typeof token === "string" && token.length > 40, true);
check("it verifies back to the same claims", await verifyReadoutLink(token!), claims);

console.log("\nTampering");
// Flip a byte in the PAYLOAD segment; the signature must stop matching.
const [h, p, s] = token!.split(".");
const decoded = JSON.parse(Buffer.from(p, "base64url").toString());
decoded.k = "some-other-experiment";
const forged = `${h}.${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${s}`;
check("a re-pointed payload is refused", await verifyReadoutLink(forged), null);
check("a truncated token is refused", await verifyReadoutLink(token!.slice(0, -4)), null);
check("garbage is refused", await verifyReadoutLink("not-a-token"), null);
check("an empty token is refused", await verifyReadoutLink(""), null);
check("a token signed with another key is refused", await verifyReadoutLink(
  // minted under a different secret
  await (async () => {
    const { SignJWT } = await import("jose");
    return new SignJWT({ o: "outrigger", k: "room-detail-overlay" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("90d")
      .sign(new TextEncoder().encode("a-completely-different-secret-16"));
  })(),
), null);

console.log("\nExpiry");
{
  const { SignJWT } = await import("jose");
  const stale = await new SignJWT({ o: "outrigger", k: "room-detail-overlay" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 400 * 86400)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 300 * 86400)
    .sign(new TextEncoder().encode(process.env.READOUT_LINK_SECRET!));
  check("an expired token is refused", await verifyReadoutLink(stale), null);
}

console.log("\nURL");
check("absolute url", await readoutLinkUrl("https://x.test", claims) !== undefined, true);
check("no base url, no link", await readoutLinkUrl(undefined, claims), undefined);

console.log("\nNO SECRET = NO LINK (never a dead button)");
{
  delete process.env.READOUT_LINK_SECRET;
  check("links are off", readoutLinksEnabled(), false);
  check("nothing can be minted", await signReadoutLink(claims), null);
  check("the url is undefined, so the renderer omits the button", await readoutLinkUrl("https://x.test", claims), undefined);
  check("and it says why", typeof readoutLinkUnavailableReason() === "string", true);
  process.env.READOUT_LINK_SECRET = "short";
  check("a too-short secret is refused too", readoutLinksEnabled(), false);
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nall link assertions passed");
process.exit(fails ? 1 : 0);
