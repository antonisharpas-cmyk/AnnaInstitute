import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { SendResult } from "./types";

/**
 * Email goes out over SMTP, which works with Google Workspace, Microsoft 365 or
 * any provider. Nothing is sent until SMTP_HOST and MAIL_FROM are set, so the
 * campaign module is safe to use and test before the mail account exists.
 *
 * For mail to arrive as info@oneeleven.com.cy rather than in a spam folder, the
 * SPF and DKIM records for that domain have to exist. Until they do, send from a
 * domain we control and set MAIL_REPLY_TO to their address.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

let transport: Transporter | null = null;

/*
 * Port 465 always means a secure connection from the first byte, whatever
 * SMTP_SECURE says, because that is the commonest way a Google Workspace setup
 * silently fails. And Google shows an app password in four groups with spaces,
 * which people copy as they see it, so the spaces are taken out.
 */
function smtpPort(): number {
  return Number(process.env.SMTP_PORT ?? 587);
}
function smtpSecure(): boolean {
  return String(process.env.SMTP_SECURE ?? "") === "true" || smtpPort() === 465;
}

/** What the mail setup is, without the password, for the Settings page. */
export function emailSetup(): { host: string; port: number; secure: boolean; user: string; from: string } | null {
  if (!emailConfigured()) return null;
  return {
    host: process.env.SMTP_HOST ?? "",
    port: smtpPort(),
    secure: smtpSecure(),
    user: process.env.SMTP_USER ?? "",
    from: process.env.MAIL_FROM ?? "",
  };
}

function getTransport() {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort(),
    secure: smtpSecure(),
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: (process.env.SMTP_PASSWORD ?? "").replace(/\s+/g, ""),
        }
      : undefined,
    /* A server that never answers is reported in seconds, not left hanging. */
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });
  return transport;
}

/**
 * A file to send with an email.
 *
 * Either one already on disk, by its path, or one drawn up on the spot, by its
 * bytes: the receipt the CRM makes for a payment never touches the disk at all.
 */
export type EmailAttachment = {
  filename: string;
  contentType?: string;
} & ({ path: string; content?: never } | { content: Buffer; path?: never });

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<SendResult> {
  if (!emailConfigured()) {
    return {
      status: "SIMULATED",
      error: "SMTP is not configured, so nothing was sent.",
    };
  }

  try {
    const info = await getTransport().sendMail({
      from: process.env.MAIL_FROM,
      replyTo: process.env.MAIL_REPLY_TO || undefined,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    });
    return { status: "SENT", providerId: info.messageId };
  } catch (error) {
    return {
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
