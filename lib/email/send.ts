import "server-only";

/**
 * Transactional email.
 *
 * Deliberately pluggable and deliberately loud when unconfigured. With no
 * RESEND_API_KEY set, it logs the message (including any link) to the server
 * console and reports `delivered: false` — so the invitation flow is fully
 * testable in development without an email provider, and the caller can tell
 * the user "we could not send this" rather than silently pretending success.
 *
 * Phase 4 replaces the console transport with Resend for real and adds the
 * digest batching.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text. HTML templates arrive with the notification work in Phase 4. */
  text: string;
};

export type EmailResult = {
  delivered: boolean;
  /** Present when nothing was actually sent, so callers can surface it. */
  reason?: string;
};

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    // Not an error in development — this is the expected path until an email
    // provider is configured.
    console.info(
      [
        "",
        "─".repeat(72),
        "  EMAIL NOT SENT — RESEND_API_KEY / EMAIL_FROM are not configured.",
        "  The message is printed here so the flow is still testable.",
        "─".repeat(72),
        `  To:      ${message.to}`,
        `  Subject: ${message.subject}`,
        "",
        message.text
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n"),
        "─".repeat(72),
        "",
      ].join("\n"),
    );
    return { delivered: false, reason: "Email is not configured on this server." };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.error(`[email] Resend returned ${response.status}: ${await response.text()}`);
      return { delivered: false, reason: "The email provider rejected the message." };
    }

    return { delivered: true };
  } catch (error) {
    console.error("[email] send failed", error);
    return { delivered: false, reason: "Could not reach the email provider." };
  }
}
