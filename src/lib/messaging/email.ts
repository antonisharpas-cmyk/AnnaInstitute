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

function getTransport() {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: String(process.env.SMTP_SECURE ?? "") === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
      : undefined,
  });
  return transport;
}

export type EmailAttachment = {
  filename: string;
  path: string;
  contentType?: string;
};

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
