import "server-only";
import { englishWord, isCustom, shownCode } from "@/lib/choices";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  auditLogs,
  automaticEmails,
  clients,
  contracts,
  documents,
  emailTemplates,
  installments,
  issuedDocuments,
  leadFollowUps,
  leadNotes,
  leads,
  messages,
  payments,
  refunds,
  teamMembers,
  units,
} from "@/db/schema";
import { formatAmount, toCents } from "@/lib/money";

/**
 * Everything that happened with one client, in order.
 *
 * Nothing new is recorded for this: every step already leaves a row behind,
 * the lead and its notes and follow ups, each change of status, the day
 * they became a client, the apartment, the contract, each appointment, each
 * payment with its papers, each email and why one did not go, each file. This
 * reads them all and puts them on one line of time, so the admin can follow a
 * buyer from the first lead to the last payment without opening ten pages.
 */

export type HistoryKind =
  | "lead"
  | "client"
  | "apartment"
  | "contract"
  | "appointment"
  | "followUp"
  | "payment"
  | "paper"
  | "email"
  | "document";

export type HistoryStatus = { label: string; tone: "good" | "warn" | "bad" | "neutral" | "teal" };

export type HistoryEvent = {
  id: string;
  at: Date;
  kind: HistoryKind;
  title: string;
  note?: string | null;
  status?: HistoryStatus | null;
  href?: string | null;
  by?: string | null;
};

const LEAD_STATUS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  ACTIVE: "Active",
  CONVERTED: "Became a client",
  CLOSED: "Closed",
  NO_RESPONSE: "No response",
  NOT_INTERESTED: "Not interested",
  ON_HOLD: "On hold",
};

const APPOINTMENT_KIND: Record<string, string> = {
  TIMBER: "Ocriam",
  BATHROOMS_TILES: "Studio Bagno",
  OFFICE: "At our office",
  PHONE_CALL: "A call",
  BUILDING: "At the building",
  OTHER: "Other",
};

const METHOD: Record<string, string> = {
  CASH: "cash",
  BANK: "bank transfer",
  CHEQUE: "cheque",
  CARD: "card",
  OTHER: "other",
};

const at = (value: Date | string | null | undefined) => (value ? new Date(value) : null);

export async function clientHistory(clientId: string, locale = "en"): Promise<HistoryEvent[]> {
  const money = (value: string | number) => formatAmount(toCents(value), locale);
  const events: HistoryEvent[] = [];
  const push = (event: Omit<HistoryEvent, "at"> & { at: Date | string | null | undefined }) => {
    const when = at(event.at);
    if (when && !Number.isNaN(when.getTime())) events.push({ ...event, at: when });
  };

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return [];

  const theirLeads = await db.select().from(leads).where(eq(leads.clientId, clientId));
  const leadIds = theirLeads.map((one) => one.id);
  const theirContracts = await db
    .select({ contract: contracts, unit: units })
    .from(contracts)
    .leftJoin(units, eq(units.id, contracts.unitId))
    .where(eq(contracts.clientId, clientId));
  const contractIds = theirContracts.map((one) => one.contract.id);
  const refOf = new Map(theirContracts.map((one) => [one.contract.id, one.contract.reference]));

  /* 1. Before they were a client: the lead, its notes, follow ups and statuses. */
  for (const lead of theirLeads) {
    /* Where it came from, said once: the form's name, or else the source. */
    const where =
      lead.formName ||
      (lead.sourceChoice && shownCode(lead.sourceKind, lead.sourceChoice) === lead.sourceChoice
        ? await englishWord("leadSource", lead.sourceChoice)
        : lead.sourceKind === "OTHER"
          ? lead.source
          : lead.sourceKind?.toLowerCase().replace(/_/g, " ")) ||
      "";
    push({
      id: `lead-${lead.id}`,
      at: lead.createdAt,
      kind: "lead",
      title: `Lead received${where ? ` (${where})` : ""}`,
      note: [lead.interest || lead.projectName, lead.message].filter(Boolean).join(". ") || null,
      href: `/leads/${lead.id}`,
    });
    if (lead.consent) {
      push({
        id: `lead-consent-${lead.id}`,
        at: lead.createdAt,
        kind: "lead",
        title: "Marketing consent given on the lead",
        note: lead.consentText,
        status: { label: "Consent", tone: "good" },
      });
    }
  }

  if (leadIds.length > 0) {
    const notes = await db.select().from(leadNotes).where(inArray(leadNotes.leadId, leadIds));
    for (const note of notes) {
      push({ id: `note-${note.id}`, at: note.createdAt, kind: "lead", title: "Note", note: note.body });
    }
  }

  /* 2. What the office did, as the audit kept it. */
  const touched = [clientId, ...leadIds, ...contractIds];
  const logged = await db
    .select()
    .from(auditLogs)
    .where(
      or(
        inArray(auditLogs.entityId, touched),
        and(eq(auditLogs.entity, "unit"), sql`${auditLogs.detail} like ${`%client ${clientId}%`}`),
      ),
    );
  for (const row of logged) {
    const base = { id: `audit-${row.id}`, at: row.createdAt, by: row.userEmail };
    switch (row.action) {
      case "lead.status": {
        const [from, to] = (row.detail ?? "").split(" to ");
        const say = async (code: string) =>
          isCustom(code) ? await englishWord("leadStatus", code) : (LEAD_STATUS[code] ?? code);
        const words = to ? `${await say(from)} to ${await say(to)}` : await say(from);
        push({ ...base, kind: "lead", title: `Status changed: ${words}` });
        break;
      }
      case "lead.assigned":
        push({ ...base, kind: "lead", title: `Team member assigned: ${row.detail ?? "nobody yet"}` });
        break;
      case "lead.converted":
        push({ ...base, kind: "client", title: "Became a client", status: { label: "Client", tone: "teal" } });
        break;
      case "client.consent.granted":
        push({ ...base, kind: "client", title: "Marketing consent given", status: { label: "Consent", tone: "good" } });
        break;
      case "client.consent.removed":
      case "client.unsubscribed":
        push({ ...base, kind: "client", title: "Marketing consent withdrawn", status: { label: "No consent", tone: "warn" } });
        break;
      case "client.update":
        push({ ...base, kind: "client", title: "Personal details updated" });
        break;
      case "client.closed":
        push({ ...base, kind: "client", title: "Client closed", note: row.detail, status: { label: "Closed", tone: "bad" } });
        break;
      case "client.reopened":
        push({ ...base, kind: "client", title: "Client reopened" });
        break;
      case "unit.assign": {
        const code = (row.detail ?? "").split(" to client")[0];
        const how = /as (\w+)$/.exec(row.detail ?? "")?.[1];
        push({ ...base, kind: "apartment", title: `Apartment ${code} assigned${how ? ` (${how})` : ""}` });
        break;
      }
      case "unit.unassign": {
        const code = (row.detail ?? "").split(" released")[0];
        push({ ...base, kind: "apartment", title: `Apartment ${code} released` });
        break;
      }
      case "contract.update":
        push({ ...base, kind: "contract", title: `Contract ${refOf.get(row.entityId ?? "") ?? ""} changed`, href: `/contracts/${row.entityId}` });
        break;
      case "contract.reducedVat":
        push({
          ...base,
          kind: "contract",
          title: `Reduced VAT approved on contract ${refOf.get(row.entityId ?? "") ?? ""}`,
          note: row.detail,
          href: `/contracts/${row.entityId}`,
          status: { label: "Reduced VAT", tone: "teal" },
        });
        break;
      default:
        break;
    }
  }

  /* When they became a client, if no lead came before it. */
  if (!logged.some((row) => row.action === "lead.converted")) {
    push({ id: `client-${client.id}`, at: client.createdAt, kind: "client", title: "Client record created", status: { label: "Client", tone: "teal" } });
  }

  /* 3. The contracts, and the money on them. */
  for (const { contract, unit } of theirContracts) {
    push({
      id: `contract-${contract.id}`,
      at: contract.createdAt,
      kind: "contract",
      title: `Contract ${contract.reference} written${unit ? ` for ${unit.code}` : ""}`,
      note: `${money(contract.netPrice)} before VAT`,
      href: `/contracts/${contract.id}`,
      status:
        contract.status === "CANCELLED"
          ? { label: "Cancelled", tone: "bad" }
          : contract.status === "COMPLETED"
            ? { label: "Completed", tone: "good" }
            : null,
    });
  }

  if (contractIds.length > 0) {
    const [paid, papers, backs] = await Promise.all([
      db
        .select({ payment: payments, stage: installments.label })
        .from(payments)
        .leftJoin(installments, eq(installments.id, payments.installmentId))
        .where(inArray(payments.contractId, contractIds)),
      db.select().from(issuedDocuments).where(inArray(issuedDocuments.contractId, contractIds)),
      db.select().from(refunds).where(inArray(refunds.contractId, contractIds)),
    ]);
    for (const { payment, stage } of paid) {
      if (payment.kind === "CREDIT") {
        if (toCents(payment.amount) > 0) {
          push({
            id: `credit-${payment.id}`,
            at: payment.createdAt,
            kind: "payment",
            title: `VAT credit of ${money(payment.amount)} put on ${stage ?? "the next stage"}`,
            note: payment.notes,
            href: `/contracts/${payment.contractId}`,
            status: { label: "Credit", tone: "teal" },
          });
        }
        continue;
      }
      const invoice = papers.find((one) => one.paymentId === payment.id && one.kind === "INVOICE" && !one.creditedById && !one.voidedAt);
      const receipt = papers.find((one) => one.paymentId === payment.id && one.kind === "RECEIPT" && !one.voidedAt);
      push({
        id: `pay-${payment.id}`,
        at: payment.createdAt,
        kind: "payment",
        title: `Paid ${stage ?? "on the contract"}: ${money(payment.amount)}`,
        note: [
          `Paid on ${new Date(payment.paidOn).toLocaleDateString("en-GB")}`,
          payment.method
            ? `by ${METHOD[payment.method] ?? (isCustom(payment.method) ? (await englishWord("paymentMethod", payment.method)).toLowerCase() : payment.method.toLowerCase())}`
            : null,
          invoice ? `invoice ${invoice.number}` : null,
          receipt ? `receipt ${receipt.number}` : payment.receiptNumber ? `receipt ${payment.receiptNumber}` : null,
        ]
          .filter(Boolean)
          .join(", "),
        href: `/contracts/${payment.contractId}`,
        status: { label: "Received", tone: "good" },
      });
    }
    for (const paper of papers) {
      if (paper.kind !== "CREDIT_NOTE") continue;
      push({
        id: `cn-${paper.id}`,
        at: paper.createdAt,
        kind: "paper",
        title: `Credit note ${paper.number} issued: ${money(paper.totalAmount)}`,
        note: paper.reason,
        href: `/contracts/${paper.contractId}`,
        status: paper.voidedAt ? { label: "Void", tone: "neutral" } : { label: "Credit note", tone: "teal" },
      });
    }
    for (const back of backs) {
      push({
        id: `refund-${back.id}`,
        at: back.createdAt,
        kind: "payment",
        title: `${back.purpose === "PENALTY" ? "Delay penalty" : "Refund"} paid: ${money(back.amount)}`,
        note: back.note,
        href: `/contracts/${back.contractId}`,
        status: { label: back.purpose === "PENALTY" ? "Penalty" : "Refund", tone: "warn" },
      });
    }
  }

  /* 4. Appointments, with the client or with the lead before them. */
  const meetings = await db
    .select({ meeting: appointments, member: teamMembers })
    .from(appointments)
    .leftJoin(teamMembers, eq(teamMembers.id, appointments.assignedToId))
    .where(
      leadIds.length > 0
        ? or(eq(appointments.clientId, clientId), inArray(appointments.leadId, leadIds))
        : eq(appointments.clientId, clientId),
    );
  for (const { meeting, member } of meetings) {
    const kind =
      meeting.typeChoice && shownCode(meeting.type, meeting.typeChoice) === meeting.typeChoice
        ? await englishWord("appointmentType", meeting.typeChoice)
        : meeting.type === "OTHER" && meeting.typeOther
          ? meeting.typeOther
          : (APPOINTMENT_KIND[meeting.type] ?? meeting.type);
    push({
      id: `appt-${meeting.id}`,
      at: meeting.at,
      kind: "appointment",
      title: `Appointment: ${kind}, ${meeting.place}`,
      note: member ? `With ${member.name}` : null,
      status:
        meeting.status === "DONE"
          ? { label: "Done", tone: "good" }
          : meeting.status === "MISSED"
            ? { label: "Cancelled", tone: "bad" }
            : { label: "Pending", tone: "warn" },
    });
  }

  /* 4b. Follow ups, with the client or with the lead before them, on the day
     they are for, like the appointments. */
  const follows = await db
    .select({ follow: leadFollowUps, member: teamMembers })
    .from(leadFollowUps)
    .leftJoin(teamMembers, eq(teamMembers.id, leadFollowUps.assignedToId))
    .where(
      leadIds.length > 0
        ? or(eq(leadFollowUps.clientId, clientId), inArray(leadFollowUps.leadId, leadIds))
        : eq(leadFollowUps.clientId, clientId),
    );
  for (const { follow, member } of follows) {
    push({
      id: `follow-${follow.id}`,
      at: follow.at,
      kind: "followUp",
      title: `Follow up${follow.leadId ? ", while a lead" : ""}`,
      note: [follow.note, member ? `With ${member.name}` : null].filter(Boolean).join(". ") || null,
      status:
        follow.status === "DONE"
          ? { label: "Done", tone: "good" }
          : follow.status === "CANCELLED"
            ? { label: "Cancelled", tone: "bad" }
            : { label: "Pending", tone: "warn" },
      href: `/clients/${clientId}?tab=followups`,
    });
  }

  /* 5. Every email, and the automatic ones that did not go, with why. */
  const [sent, automatic, templates] = await Promise.all([
    db.select().from(messages).where(eq(messages.clientId, clientId)),
    db.select().from(automaticEmails).where(eq(automaticEmails.clientId, clientId)),
    db.select({ key: emailTemplates.key, name: emailTemplates.name }).from(emailTemplates),
  ]);
  const letterName = new Map(templates.map((one) => [one.key, one.name]));
  for (const message of sent) {
    push({
      id: `msg-${message.id}`,
      at: message.sentAt ?? message.createdAt,
      kind: "email",
      title: `${message.channel === "EMAIL" ? "Email" : message.channel === "SMS" ? "SMS" : "Message"}: ${message.subject ?? "(no subject)"}`,
      note: message.error ?? `To ${message.toAddress}`,
      status:
        message.status === "SENT"
          ? { label: "Sent", tone: "good" }
          : message.status === "FAILED"
            ? { label: "Failed", tone: "bad" }
            : message.status === "SIMULATED"
              ? { label: "Not sent", tone: "warn" }
              : { label: message.status.toLowerCase(), tone: "neutral" },
    });
  }
  for (const letter of automatic) {
    if (letter.status === "SENT" || letter.status === "FAILED") continue;
    /* One already on the email list, recorded as not sent, says it once. */
    const echoed = sent.some((one) => Math.abs(new Date(one.createdAt).getTime() - new Date(letter.updatedAt).getTime()) < 120000);
    if (echoed && letter.status !== "WAITING") continue;
    push({
      id: `auto-${letter.id}`,
      at: letter.updatedAt,
      kind: "email",
      title: `Automatic email: ${letterName.get(letter.templateKey) ?? letter.templateKey}`,
      note: letter.reason,
      status: letter.status === "WAITING" ? { label: "Waiting", tone: "warn" } : { label: "Not sent", tone: "neutral" },
    });
  }

  /* 6. Files added to their record by the office. The papers the CRM draws
        itself are already there, with the payment they belong to. */
  const drawn = new Set(
    (contractIds.length > 0
      ? await db.select({ id: issuedDocuments.documentId }).from(issuedDocuments).where(inArray(issuedDocuments.contractId, contractIds))
      : []
    ).map((one) => one.id),
  );
  const files = await db
    .select()
    .from(documents)
    .where(
      contractIds.length > 0
        ? or(eq(documents.clientId, clientId), inArray(documents.contractId, contractIds))
        : eq(documents.clientId, clientId),
    );
  for (const file of files) {
    if (drawn.has(file.id)) continue;
    if (/^(Invoice|Receipt|Credit note) \d+/.test(file.title)) continue;
    push({ id: `doc-${file.id}`, at: file.createdAt, kind: "document", title: `Document added: ${file.title}`, href: `/api/files/${file.id}` });
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}
