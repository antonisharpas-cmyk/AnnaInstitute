import "server-only";
import { recordAudit } from "@/lib/audit";
import { readSettings } from "@/lib/settings";
import { letterHtml } from "@/lib/messaging";
import { sendEmail } from "@/lib/messaging/email";
import { appUrl } from "@/lib/unsubscribe";

/*
 * A short email to the office when somebody leaves their details through the
 * QR code, so a new lead is seen the moment it arrives rather than the next
 * time somebody opens Leads.
 *
 * It goes to the address set in Settings, info@oneeleven-ent.cy unless changed,
 * and can be switched off there. It is the office's own email, so it carries
 * no unsubscribe link and is not kept in anybody's communication history.
 * Whatever happens here, the lead is already saved: a failed alert never
 * stops the form, it is only written to the activity log.
 */

export type LeadForAlert = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  interest: string | null;
  message: string | null;
  consent: boolean;
};

/** The addresses to alert: commas, semicolons or spaces between, each one checked. */
export function alertAddresses(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,;\s]+/)
        .map((one) => one.trim().toLowerCase())
        .filter((one) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(one)),
    ),
  ];
}

export function leadAlertText(lead: LeadForAlert): { subject: string; body: string } {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Someone";
  const lines = [
    "A new lead has just come in through the QR code form.",
    "",
    `Name: ${name}`,
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.country ? `Country: ${lead.country}` : null,
    lead.interest ? `Interested in: ${lead.interest}` : null,
    lead.message ? `Message: ${lead.message}` : null,
    `Marketing consent: ${lead.consent ? "yes" : "no"}`,
    "",
    `Open the lead in the CRM: ${appUrl()}/leads/${lead.id}`,
  ].filter((line): line is string => line !== null);
  /* The subject carries only the name, cut short: it is a stranger's input. */
  return { subject: `New lead from the QR code: ${name.slice(0, 80)}`, body: lines.join("\n") };
}

export async function sendLeadAlert(lead: LeadForAlert): Promise<void> {
  try {
    const config = await readSettings(["leads.alertOn", "leads.alertTo"]);
    if (config["leads.alertOn"] !== "yes") return;
    const to = alertAddresses(config["leads.alertTo"]);
    if (to.length === 0) return;

    const { subject, body } = leadAlertText(lead);
    const result = await sendEmail({ to: to.join(", "), subject, text: body, html: letterHtml(body) });

    await recordAudit({
      action: "lead.alert",
      entity: "lead",
      entityId: lead.id,
      detail:
        result.status === "SENT"
          ? `New lead alert sent to ${to.join(", ")}`
          : `New lead alert not sent to ${to.join(", ")}: ${result.error ?? result.status}`,
      userEmail: "qr-code-form",
    });
  } catch (error) {
    /* Never let the alert stand between the visitor and the thank you page. */
    console.error("New lead alert failed", error);
  }
}
