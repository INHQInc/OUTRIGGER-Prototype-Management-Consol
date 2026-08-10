/**
 * SENDING MAIL — one seam, two providers behind it.
 *
 *  - GMAIL (SMTP, app password): lets the readout come FROM your own Gmail
 *    address. No provider will let you send AS @gmail.com over their API —
 *    verifying a sending domain means publishing DNS for it, and nobody
 *    controls gmail.com's — so the only honest way to use that address is
 *    Google's own SMTP.
 *  - RESEND (HTTP): for when a real domain is verified. Better deliverability
 *    and no daily cap worth thinking about.
 *
 * Gmail wins when its credentials are present, because configuring it is a
 * deliberate act. Nothing above this file knows which is in use.
 *
 * FAILS LOUD when neither is configured. A mailer that silently no-ops is
 * worse than no mailer: the console would report "sent" to a room of people
 * who received nothing, and a weekly digest would appear to run for months
 * while landing nowhere.
 */
import nodemailer from "nodemailer";

const RESEND_API = "https://api.resend.com/emails";

export interface SendResult {
  id: string;
  accepted: string[];
  via: "gmail" | "resend";
}

const gmailReady = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
const resendReady = () => Boolean(process.env.RESEND_API_KEY && process.env.REPORT_FROM_EMAIL);

export function mailConfigured(): boolean {
  return gmailReady() || resendReady();
}

/** Why sending is unavailable, in words an operator can act on. */
export function mailUnavailableReason(): string | null {
  if (mailConfigured()) return null;
  if (process.env.GMAIL_USER && !process.env.GMAIL_APP_PASSWORD) {
    return "GMAIL_APP_PASSWORD isn't set — Gmail needs an App Password, which requires 2-Step Verification on the account.";
  }
  if (process.env.RESEND_API_KEY && !process.env.REPORT_FROM_EMAIL) {
    return "REPORT_FROM_EMAIL isn't set — Resend needs a verified sending address.";
  }
  return "No mail credentials on this deployment. Set GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY + REPORT_FROM_EMAIL.";
}

/** Who the mail says it is from. Gmail can only ever be the authenticated
 *  account — Google rewrites anything else, so claiming otherwise would put a
 *  lie in the header. */
export function fromAddress(): string {
  if (gmailReady()) {
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
  const to = validRecipients(opts.to);
  if (!to.length) throw new Error("No valid recipient addresses.");
  const subject = opts.subject.slice(0, 200);

  if (gmailReady()) {
    // BCC, not To. A weekly digest going to a leadership list should not
    // publish everyone's address to everyone else, and a reply-all storm on an
    // automated report helps nobody.
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! },
    });
    try {
      const info = await transport.sendMail({
        from: fromAddress(),
        to: process.env.GMAIL_USER!,
        bcc: to,
        subject,
        html: opts.html,
        text: opts.text,
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      });
      return { id: info.messageId ?? "", accepted: to, via: "gmail" };
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

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to,
      subject,
      html: opts.html,
      text: opts.text,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`The mail provider refused it (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: json.id ?? "", accepted: to, via: "resend" };
}
