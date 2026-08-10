/**
 * SENDING MAIL — one seam, three providers behind it.
 *
 *  - MAILGUN (HTTP): sends as the brand's own domain. brandgraphai.com already
 *    authenticates through Mailgun in DNS, so this needs a key and nothing else.
 *  - RESEND (HTTP): the same job for a domain verified with Resend instead.
 *  - GMAIL (SMTP, app password): the fallback, and the only honest way to send
 *    FROM a @gmail.com address — no provider will let you send as a domain it
 *    cannot verify, and nobody controls gmail.com's DNS.
 *
 * PRECEDENCE, when more than one is configured: mailgun → resend → gmail. A
 * provider that authenticates the sending DOMAIN can put the brand in the From
 * line; Gmail can only ever be one person's personal account, because Google
 * rewrites any other address. So a domain sender outranks it — always.
 *
 * `MAIL_PROVIDER` pins one explicitly. If it names a provider that isn't
 * configured, sending is UNAVAILABLE and says so; it never quietly falls
 * through to a different sender. A report that arrives from an address nobody
 * expected is worse than a report that doesn't arrive.
 *
 * FAILS LOUD when none is configured. A mailer that silently no-ops is worse
 * than no mailer: the console would report "sent" to a room of people who
 * received nothing, and a weekly digest would appear to run for months while
 * landing nowhere.
 */
import nodemailer from "nodemailer";

const RESEND_API = "https://api.resend.com/emails";

export type MailProvider = "mailgun" | "resend" | "gmail";

/** Tried in this order when nothing is pinned. Domain senders first. */
const ORDER: readonly MailProvider[] = ["mailgun", "resend", "gmail"];

export interface SendResult {
  id: string;
  accepted: string[];
  /** Recipients the provider refused, with the reason. Partial success is a
   *  real outcome and must not be reported as "sent". */
  failed: { to: string; error: string }[];
  via: MailProvider;
}

/** What each provider needs. Named here once so the readiness test and the
 *  operator-facing error cannot disagree about it. */
const NEEDS: Record<MailProvider, readonly string[]> = {
  mailgun: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "REPORT_FROM_EMAIL"],
  resend: ["RESEND_API_KEY", "REPORT_FROM_EMAIL"],
  gmail: ["GMAIL_USER", "GMAIL_APP_PASSWORD"],
};

/** The variables this provider still wants. Empty means ready.
 *  A var set to whitespace counts as missing — a blank value in a dashboard
 *  field looks set and behaves as if it isn't, which is the worst of both. */
function missingFor(p: MailProvider): string[] {
  return NEEDS[p].filter((v) => !(process.env[v] ?? "").trim());
}

function ready(p: MailProvider): boolean {
  return missingFor(p).length === 0;
}

/** The provider named by MAIL_PROVIDER, or null if unset/unrecognised. */
function pinned(): MailProvider | null {
  const v = process.env.MAIL_PROVIDER?.trim().toLowerCase();
  return ORDER.find((p) => p === v) ?? null;
}

/** Which provider this deployment will actually use, or null if it can't send. */
export function activeProvider(): MailProvider | null {
  const want = pinned();
  if (want) return ready(want) ? want : null;
  return ORDER.find(ready) ?? null;
}

export function mailConfigured(): boolean {
  return activeProvider() !== null;
}

/** Why sending is unavailable, in words an operator can act on. */
export function mailUnavailableReason(): string | null {
  if (mailConfigured()) return null;

  const want = pinned();
  if (want) {
    // Name the ones ACTUALLY missing. Listing everything the provider needs
    // tells an operator nothing they didn't already know and sends them
    // re-checking three variables when one is wrong.
    const gone = missingFor(want);
    const list = gone.length === 1 ? gone[0] : `${gone.slice(0, -1).join(", ")} and ${gone[gone.length - 1]}`;
    return `MAIL_PROVIDER is pinned to "${want}", but ${list} ${gone.length === 1 ? "is" : "are"} missing on this deployment. Note that Vercel only applies an environment variable to deployments created AFTER it was added — if you have just set it, redeploy. Nothing else will be used in its place.`;
  }
  if (process.env.MAIL_PROVIDER?.trim()) {
    return `MAIL_PROVIDER is set to "${process.env.MAIL_PROVIDER.trim()}", which isn't a provider this app knows. Use mailgun, resend or gmail — or leave it unset.`;
  }

  // Half-configured is the common case, and naming the missing half saves an
  // hour of staring at a deployment that looks configured.
  if (process.env.MAILGUN_API_KEY && !process.env.MAILGUN_DOMAIN) {
    return "MAILGUN_DOMAIN isn't set — Mailgun sends through a named sending domain.";
  }
  if ((process.env.MAILGUN_API_KEY || process.env.RESEND_API_KEY) && !process.env.REPORT_FROM_EMAIL) {
    return "REPORT_FROM_EMAIL isn't set — a domain sender needs the address the readout comes from.";
  }
  if (process.env.GMAIL_USER && !process.env.GMAIL_APP_PASSWORD) {
    return "GMAIL_APP_PASSWORD isn't set — Gmail needs an App Password, which requires 2-Step Verification on the account.";
  }
  return "No mail credentials on this deployment. Set MAILGUN_API_KEY + MAILGUN_DOMAIN + REPORT_FROM_EMAIL, or RESEND_API_KEY + REPORT_FROM_EMAIL, or GMAIL_USER + GMAIL_APP_PASSWORD.";
}

/** Who the mail says it is from. Gmail can only ever be the authenticated
 *  account — Google rewrites anything else, so claiming otherwise would put a
 *  lie in the header. */
export function fromAddress(): string {
  if (activeProvider() === "gmail") {
    const user = process.env.GMAIL_USER!;
    const label = process.env.REPORT_FROM_NAME?.trim();
    return label ? `${label} <${user}>` : user;
  }
  return process.env.REPORT_FROM_EMAIL ?? "";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Addresses that are actually addresses. Anything else never reaches a queue. */
export function validRecipients(list: unknown): string[] {
  return (Array.isArray(list) ? list : [])
    .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
    .filter((v) => EMAIL.test(v))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 50);
}

/** Mailgun is regional: a US key against the EU host returns 401, which reads
 *  like a bad key and costs an afternoon. Named explicitly rather than guessed. */
function mailgunBase(): string {
  const explicit = process.env.MAILGUN_BASE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  return process.env.MAILGUN_REGION?.trim().toLowerCase() === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net";
}

export async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  /** Plain-text alternative — every serious client wants one, and its absence
   *  is a spam signal. */
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const reason = mailUnavailableReason();
  if (reason) throw new Error(reason);
  const provider = activeProvider()!;
  const to = validRecipients(opts.to);
  if (!to.length) throw new Error("No valid recipient addresses.");
  const subject = opts.subject.slice(0, 200);
  const from = fromAddress();

  // ONE MESSAGE PER RECIPIENT — deliberately not BCC.
  //
  // BCC needs something in the visible To, and the only address available is
  // the sender's own. That address is not necessarily deliverable: send from a
  // domain whose MX points elsewhere and every message HARD BOUNCES on its own
  // To header while the BCC copies arrive fine. It looks like it works. It is
  // not working: SES suspends senders above roughly a 5% bounce rate and this
  // pattern bounces on ~100% of messages.
  //
  // Per-recipient sending also keeps the list private more thoroughly than BCC
  // ever did — each person's copy names only them — and it gives per-recipient
  // delivery status instead of one aggregate verdict.
  const accepted: string[] = [];
  const failed: { to: string; error: string }[] = [];
  let firstId = "";

  const transport =
    provider === "gmail"
      ? nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! },
        })
      : null;

  for (const recipient of to) {
    try {
      const id = await sendOne(provider, { from, to: recipient, subject, html: opts.html, text: opts.text, replyTo: opts.replyTo }, transport);
      if (!firstId) firstId = id;
      accepted.push(recipient);
    } catch (e) {
      failed.push({ to: recipient, error: (e as Error).message.slice(0, 300) });
    }
  }

  // Nobody got it => this was a failure, not a partial one. Surface the actual
  // provider error rather than a count of zero.
  if (!accepted.length) {
    throw new Error(failed[0]?.error ?? "The mail provider accepted no recipients.");
  }
  return { id: firstId, accepted, failed, via: provider };
}

/** Deliver to exactly one address. Throws with a provider-specific explanation. */
async function sendOne(
  provider: MailProvider,
  msg: { from: string; to: string; subject: string; html: string; text: string; replyTo?: string },
  transport: nodemailer.Transporter | null,
): Promise<string> {
  if (provider === "gmail") {
    try {
      const info = await transport!.sendMail({
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      });
      return info.messageId ?? "";
    } catch (e) {
      const m = (e as Error).message;
      // Google's own wording here is famously unhelpful ("Username and Password
      // not accepted"), and the cause is almost always the same one.
      throw new Error(
        /invalid login|username and password not accepted|badcredentials/i.test(m)
          ? "Gmail rejected the credentials. An App Password is required — an ordinary account password will not work, and 2-Step Verification must be on."
          : `Gmail refused it: ${m.slice(0, 300)}`,
      );
    }
  }

  if (provider === "mailgun") {
    const domain = process.env.MAILGUN_DOMAIN!.trim();
    const form = new URLSearchParams();
    form.set("from", msg.from);
    form.set("to", msg.to);
    form.set("subject", msg.subject);
    form.set("html", msg.html);
    form.set("text", msg.text);
    if (msg.replyTo) form.set("h:Reply-To", msg.replyTo);

    const res = await fetch(`${mailgunBase()}/v3/${encodeURIComponent(domain)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 401) {
        throw new Error(
          `Mailgun rejected the key (401). Either the key is wrong, or it belongs to the other region — this deployment is talking to ${mailgunBase()}. Set MAILGUN_REGION=eu if the domain lives in Mailgun's EU region.`,
        );
      }
      if (res.status === 404) {
        throw new Error(`Mailgun doesn't have a sending domain called "${domain}" (404). MAILGUN_DOMAIN must match the domain as Mailgun spells it.`);
      }
      if (res.status === 403) {
        throw new Error(`Mailgun refused it (403): ${body}. On a sandbox or unverified domain, only pre-authorised recipients can be mailed.`);
      }
      throw new Error(`Mailgun refused it (${res.status}): ${body}`);
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return json.id ?? "";
  }

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: msg.from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend refused it (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return json.id ?? "";
}
