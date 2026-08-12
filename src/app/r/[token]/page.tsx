import { getContentStore } from "@/lib/content/store";
import { resolvePrototypeOrg } from "@/lib/prototypes/org";
import { verifyReadoutLink } from "@/lib/reports/link";
import { buildFor } from "@/lib/reports/build";
import { renderReadoutEmail } from "@/lib/email/readout";
import { PrintReadoutButton } from "@/components/PrintReadoutButton";

export const dynamic = "force-dynamic";

/**
 * THE PUBLIC READOUT — what "Open the full readout →" should always have done.
 *
 * No session. The token IS the authority, it names one prototype, and it is
 * signed, so editing the URL cannot widen it. Holding this link is equivalent
 * to holding the email it came in.
 *
 * It serves the SAME document the email carries — `renderReadoutEmail` over the
 * same model — rather than a second rendering that would drift from it. The
 * reader's own browser is a real renderer with real fonts, so the print button
 * produces a faithful PDF at zero cost to the deployment.
 */
export const metadata = {
  robots: { index: false, follow: false },
  title: "Experiment readout",
};

export default async function PublicReadout({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claims = await verifyReadoutLink(token);
  // ONE ANSWER FOR EVERY FAILURE — bad signature, expired, unknown prototype.
  // Telling an anonymous visitor which one it was only helps someone probing.
  if (!claims) return <Expired />;

  const proto = (await (await getContentStore()).listPrototypes()).find((p) => p.key === claims.prototypeKey);
  if (!proto) return <Expired />;
  // The token names an org, but the RECORD decides. A token minted before a
  // prototype moved must not read it at its new owner.
  if ((await resolvePrototypeOrg(proto)) !== claims.orgId) return <Expired />;

  const built = await buildFor(claims.orgId, proto);
  if ("unavailable" in built) return <Unavailable why={built.unavailable ?? "no readable results yet"} />;

  const { html } = renderReadoutEmail({
    prototypeName: proto.name,
    prototypeKey: proto.key,
    // No link inside the page you are already on.
    url: undefined,
    results: built.results!, stats: built.stats, verdict: built.verdict, reading: built.reading,
    map: built.resolved, supporting: built.supporting, model: built.model,
  });

  // The email document is a complete HTML page. Only its BODY belongs inside
  // this one, so the shell is lifted out rather than nesting <html> in <html>.
  const body = html.slice(html.indexOf("<body"), html.lastIndexOf("</body>") + 7)
    .replace(/^<body[^>]*>/, "")
    .replace(/<\/body>$/, "");

  // AND THE <style> BLOCK, which lives in the head the slice just discarded.
  // It carries the max-width:640px rules that stack the metrics grid into
  // cards — drop it and a phone visitor gets the six-column desktop table
  // crushed to 375px, which is the exact wrapping this document was fixed for.
  // Most people click this link from the phone the email arrived on.
  const css = [...html.slice(0, html.indexOf("<body")).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n");

  return (
    <div style={{ margin: 0, background: "#E8ECF0", minHeight: "100vh" }}>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <PrintBar />
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}

/** The reader's own browser is the renderer — real fonts, real backgrounds,
 *  and no Chromium in our deployment. Hidden when printing, obviously. */
function PrintBar() {
  return (
    <div
      className="print:hidden"
      style={{
        display: "flex", justifyContent: "flex-end",
        padding: "12px 20px", background: "#E8ECF0",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
      }}
    >
      <PrintReadoutButton />
    </div>
  );
}

function Shell({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#E8ECF0", padding: "24px",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
    }}>
      <div style={{ maxWidth: "460px", background: "#FFFFFF", borderRadius: "12px", padding: "28px" }}>
        <h1 style={{ fontSize: "19px", fontWeight: 800, color: "#101820", margin: "0 0 8px" }}>{title}</h1>
        <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#2B3742", margin: 0 }}>{detail}</p>
      </div>
    </div>
  );
}

const Expired = () => (
  <Shell
    title="This link has expired"
    detail="Readout links last ninety days. Ask whoever sent it for a fresh one, or open the report in the console."
  />
);

const Unavailable = ({ why }: { why: string }) => (
  <Shell
    title="Nothing to show yet"
    detail={`This experiment has no readable results right now — ${why}. The link keeps working; try again once it has traffic.`}
  />
);
