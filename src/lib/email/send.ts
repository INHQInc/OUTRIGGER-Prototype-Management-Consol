/**
 * SENDING MAIL — one seam, one provider behind it.
 *
 * Resend is the implementation; nothing above this file knows that. Swapping
 * to SES or Postmark is this file and no other.
 *
 * FAILS LOUD. A mailer that silently no-ops when it is unconfigured is worse
 * than no mailer: the console would report "sent" to a room of people who
 * never received anything, and a weekly digest would appear to be running for
 * months while landing nowhere.
 */

const API = "https://api.resend.com/emails";

export interface SendResult {
  id: string;
  accepted: string[];
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.REPORT_FROM_EMAIL);
}

/** Why sending is unavailable, in words an operator can act on. */
export function mailUnavailableReason(): string | null {
  if (!process.env.RESEND_API_KEY) return "RESEND_API_KEY isn't set on this deployment.";
  if (!process.env.REPORT_FROM_EMAIL) return "REPORT_FROM_EMAIL isn't set — mail needs a verified sending address.";
  return null;
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

  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.REPORT_FROM_EMAIL,
      to,
      subject: opts.subject.slice(0, 200),
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
  return { id: json.id ?? "", accepted: to };
}
