import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { SendResult } from "./types";

/**
 * Email goes out over SMTP, which works with Google Workspace, Microsoft 365 or
 * any provider. Nothing is sent until SMTP_HOST is set, so the
 * campaign module is safe to use and test before the mail account exists.
 *
 * For mail to arrive as info@oneeleven.com.cy rather than in a spam folder, the
 * SPF and DKIM records for that domain have to exist. Until they do, send from a
 * domain we control and set MAIL_REPLY_TO to their address.
 */
/*
 * The settings, read forgivingly.
 *
 * Setups arrive with slightly different names depending on which guide was
 * followed, SMTP_PASS for SMTP_PASSWORD, SMTP_FROM or EMAIL_FROM for MAIL_FROM,
 * and with stray spaces or quotes around the value. All of those are accepted.
 * MAIL_FROM may be left out entirely: the mail then goes from the account that
 * signs in, which with Google Workspace is what it has to be anyway.
 */
export const MAIL_KEYS = {
  host: ["SMTP_HOST", "MAIL_HOST", "EMAIL_HOST", "SMTP_SERVER"],
  port: ["SMTP_PORT", "MAIL_PORT", "EMAIL_PORT"],
  secure: ["SMTP_SECURE", "MAIL_SECURE", "EMAIL_SECURE"],
  user: ["SMTP_USER", "SMTP_USERNAME", "MAIL_USER", "MAIL_USERNAME", "EMAIL_USER"],
  password: ["SMTP_PASSWORD", "SMTP_PASS", "MAIL_PASSWORD", "MAIL_PASS", "EMAIL_PASSWORD", "EMAIL_PASS"],
  from: ["MAIL_FROM", "SMTP_FROM", "EMAIL_FROM", "MAIL_SENDER"],
  replyTo: ["MAIL_REPLY_TO", "SMTP_REPLY_TO", "EMAIL_REPLY_TO"],
} as const;

function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

export function mailSetting(which: keyof typeof MAIL_KEYS): string {
  for (const key of MAIL_KEYS[which]) {
    const value = clean(process.env[key]);
    if (value) return value;
  }
  return "";
}

function mailFrom(): string {
  return mailSetting("from") || mailSetting("user");
}

export function emailConfigured(): boolean {
  return Boolean(mailSetting("host") && mailFrom());
}

let transport: Transporter | null = null;

/*
 * Port 465 always means a secure connection from the first byte, whatever
 * SMTP_SECURE says, because that is the commonest way a Google Workspace setup
 * silently fails. And Google shows an app password in four groups with spaces,
 * which people copy as they see it, so the spaces are taken out.
 */
function smtpPort(): number {
  return Number(mailSetting("port") || 587);
}
function smtpSecure(): boolean {
  return mailSetting("secure") === "true" || smtpPort() === 465;
}

/** What the mail setup is, without the password, for the Settings page. */
export function emailSetup(): { host: string; port: number; secure: boolean; user: string; from: string } | null {
  if (!emailConfigured()) return null;
  return {
    host: mailSetting("host"),
    port: smtpPort(),
    secure: smtpSecure(),
    user: mailSetting("user"),
    from: mailFrom(),
  };
}

function getTransport() {
  if (transport) return transport;
  const user = mailSetting("user");
  transport = nodemailer.createTransport({
    host: mailSetting("host"),
    port: smtpPort(),
    secure: smtpSecure(),
    auth: user ? { user, pass: mailSetting("password").replace(/\s+/g, "") } : undefined,
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

/**
 * The office's master switch for email.
 *
 * Off means nothing at all leaves the CRM by email: no automatic letters, no
 * receipts, no appointment confirmations or reminders, no daily summaries, no
 * campaigns. Everything is still written and recorded, marked as held by the
 * switch, so turning it back on loses nothing but the moment. Read from the
 * settings table each time, so the switch takes effect at once.
 */
export async function emailSwitchedOff(): Promise<boolean> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, "mail.enabled")).limit(1);
    return row?.value === "no";
  } catch {
    return false;
  }
}

export const SWITCHED_OFF = "All emails are switched off in Settings, so nothing was sent.";

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
  /** Only the test email to the office itself goes past the master switch. */
  pastTheSwitch?: boolean;
}): Promise<SendResult> {
  if (!options.pastTheSwitch && (await emailSwitchedOff())) {
    return { status: "SIMULATED", error: SWITCHED_OFF };
  }
  if (!emailConfigured()) {
    return {
      status: "SIMULATED",
      error: "SMTP is not configured, so nothing was sent.",
    };
  }

  try {
    const info = await getTransport().sendMail({
      from: mailFrom(),
      replyTo: mailSetting("replyTo") || undefined,
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
