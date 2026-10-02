import "server-only";
import { stageFrom, stageNames } from "@/lib/choices/stages";
import { englishWord, shownCode } from "@/lib/choices";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  appointments,
  automaticEmails,
  clients,
  commissions,
  contracts,
  documents,
  installments,
  leads,
  payments,
  projects,
  teamMembers,
  units,
} from "@/db/schema";
import { formatAmount, toCents } from "@/lib/money";
import { sendAndRecord } from "@/lib/messaging";
import { resolveStored } from "@/lib/storage";
import { templateByKey, type AutomaticKey } from "@/lib/templates";
import { issuedAttachments, issueForPayment } from "@/lib/issued";
import { markSignedSent, PAPER_NAME, paperForPayment } from "@/lib/signingPapers";
import type { EmailAttachment } from "@/lib/messaging/email";
import { buyersFirstNames, buyersName, emailList, hasSecondBuyer, isBirthday } from "@/lib/buyers";

/**
 * The letters that follow the money.
 *
 * A buyer pays, and the CRM writes to them: the reservation with a welcome, the
 * signing with the contract, every installment after that with its receipt, and
 * the last one with congratulations. Nobody presses anything, which is the
 * whole point, so everything here is careful about the two ways that goes
 * wrong: the same letter arriving twice, and a letter arriving without the
 * paper it promises.
 *
 * Nothing in here throws. A payment is the office's record of money received
 * and it must be saved whatever the mail server thinks, so every failure is
 * written down as a failure and the payment stands.
 */

/** Which of the four letters this payment calls for. */
function letterFor(options: {
  stage: string | null;
  outstandingCents: number;
  /** The built in stage the line counts as, from its words in the Builder. */
  counted?: string | null;
}): AutomaticKey {
  const stage = (options.stage ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  /* Paid off is the last word, whatever stage it happened on: a buyer who
     clears the balance early gets the congratulations, not a statement. */
  if (options.outstandingCents <= 0) return "paid_final";
  if (options.counted === "RESERVATION") return "paid_reservation";
  if (options.counted === "SIGNING") return "paid_signing";
  /* Both wordings of the signing, because contracts written before the office
     settled on their seven stages say it the shorter way. */
  const SIGNING = ["on signing of the contract", "on signing of contract", "υπογραφη συμβολαιου"];
  if (stage === "reservation" || stage === "κρατηση") return "paid_reservation";
  if (SIGNING.includes(stage)) return "paid_signing";
  return "paid_installment";
}

/** The letter says the signed copy is attached, after the line about the receipt. */
function sayAttached(body: string, paper: string): string {
  const sentence = `Your signed ${paper} is attached as well.`;
  const lines = body.split("\n");
  const at = lines.findIndex((line) => /attached/i.test(line));
  if (at >= 0) {
    lines[at] = `${lines[at].trimEnd()} ${sentence}`;
    return lines.join("\n");
  }
  const end = body.lastIndexOf("\n\n");
  return end > 0 ? `${body.slice(0, end)}\n\n${sentence}${body.slice(end)}` : `${body}\n\n${sentence}`;
}

/** What the braces in a letter are filled with. */
export function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) => values[key] ?? whole);
}

type Papers = EmailAttachment;

/**
 * Every file the office filed against this payment.
 *
 * The invoice, the receipt, the bank slip: whatever was attached when the money
 * was recorded goes with the letter, all of it, not only the newest one.
 */
async function filedWith(paymentId: string): Promise<Papers[]> {
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.paymentId, paymentId))
    .orderBy(asc(documents.createdAt));
  return rows.map((row) => ({
    filename: row.originalName || row.title,
    path: resolveStored(row.filePath),
    contentType: row.mimeType ?? undefined,
  }));
}

/** The contract itself, filed against the contract record. */
async function contractPaper(contractId: string): Promise<Papers | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.contractId, contractId), eq(documents.category, "CONTRACT")))
    .orderBy(desc(documents.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    filename: row.originalName || row.title,
    path: resolveStored(row.filePath),
    contentType: row.mimeType ?? undefined,
  };
}

/**
 * Write to the buyer about one payment.
 *
 * Called after a payment is recorded, and again when a contract is filed, for
 * the letter that was waiting on it. It answers to itself: if this payment has
 * already been written about, it stops.
 */
export async function letterForPayment(paymentId: string): Promise<void> {
  const [row] = await db
    .select({
      payment: payments,
      contract: contracts,
      client: clients,
      unit: units,
      project: projects,
      installment: installments,
    })
    .from(payments)
    .innerJoin(contracts, eq(contracts.id, payments.contractId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(installments, eq(installments.id, payments.installmentId))
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!row) return;

  /* Already written about, and not merely waiting: nothing to do. */
  const [already] = await db
    .select()
    .from(automaticEmails)
    .where(eq(automaticEmails.paymentId, paymentId))
    .limit(1);
  if (already && already.status !== "WAITING") return;

  const [owed] = await db
    .select({
      due: sql<string>`coalesce(sum(${installments.totalAmount}), 0)`,
    })
    .from(installments)
    .where(eq(installments.contractId, row.contract.id));

  const [got] = await db
    .select({ paid: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(eq(payments.contractId, row.contract.id));

  const dueCents = toCents(owed?.due ?? "0");
  const paidCents = toCents(got?.paid ?? "0");
  const outstandingCents = dueCents - paidCents;

  const counted = stageFrom(await stageNames(), row.installment?.label, row.installment?.labelEl);
  const key = letterFor({
    counted,
    stage: row.installment?.label ?? null,
    outstandingCents: dueCents > 0 ? outstandingCents : 1,
  });

  const note = async (status: "SENT" | "WAITING" | "FAILED" | "SKIPPED", reason: string) => {
    const values = {
      templateKey: key,
      contractId: row.contract.id,
      paymentId,
      clientId: row.client?.id ?? null,
      status,
      reason,
      sentAt: status === "SENT" ? new Date() : null,
      updatedAt: new Date(),
    };
    if (already) {
      await db.update(automaticEmails).set(values).where(eq(automaticEmails.id, already.id));
    } else {
      await db.insert(automaticEmails).values(values);
    }
  };

  /*
   * A land exchange is not a sale, so the buyer's letters are not for it.
   *
   * They welcome somebody to an apartment they are buying, congratulate them on
   * paying it off and talk about the keys, none of which is true of an owner
   * who gave land. Money recorded on a land exchange is still recorded; it is
   * only the letter that does not go, and the record says why.
   */
  if (row.contract.kind === "LAND_EXCHANGE") {
    await note("SKIPPED", "A land exchange is not a sale, so the buyer's letters do not go.");
    return;
  }

  const template = await templateByKey(key);
  if (!template) return;
  if (!template.isActive) {
    await note("SKIPPED", "This letter is switched off in the automatic emails section.");
    return;
  }

  if (!row.client?.email) {
    await note("SKIPPED", "The buyer has no email address on their record.");
    return;
  }

  /*
   * The signing letter carries the contract, so it waits for it.
   *
   * The office asked for the contract to be attached before the payment is
   * marked. Rather than refusing money that has genuinely arrived, the payment
   * is kept and the letter waits here, in plain sight in the automatic emails
   * section, and goes by itself the moment the contract is filed.
   */
  /*
   * The Reservation or the Contract of Sale paid with this stage, when it went
   * through the steps on the contract: the letter carries the signed copy, so
   * it waits for it, and goes the moment it is uploaded.
   */
  const signing = await paperForPayment(row.contract.id, row.payment.installmentId, counted);
  if (signing && !signing.signed) {
    await note("WAITING", `Waiting for the signed ${PAPER_NAME[signing.kind]} to be uploaded on the contract.`);
    return;
  }

  const papers: Papers[] = [];
  if (key === "paid_signing") {
    const theContract = await contractPaper(row.contract.id);
    if (!theContract) {
      await note("WAITING", "Waiting for the contract to be attached to this record.");
      return;
    }
    papers.push(theContract);
  }

  /*
   * The invoice and the receipt the CRM issued, first, then whatever the
   * office filed against the payment.
   *
   * They are always there, so a buyer has the papers for their money even when
   * nothing was scanned. If issuing fails for any reason the letter still goes
   * with the rest, because a missing PDF is no reason to leave a buyer without
   * the letter.
   */
  try {
    await issueForPayment(paymentId);
    for (const one of await issuedAttachments(paymentId)) {
      papers.push({ filename: one.filename, content: one.content, contentType: one.contentType });
    }
  } catch {
    /* Carry on without them. */
  }
  papers.push(...(await filedWith(paymentId)));
  /* The signed Reservation; a signed Contract of Sale is the contract above. */
  const signedReservation = signing?.signed && signing.kind === "RESERVATION" ? signing.signed : null;
  if (signing?.signed && (signing.kind === "RESERVATION" || key !== "paid_signing")) papers.push(signing.signed);

  /* Every letter goes in English, as the office asked. */
  const locale: string = "en";
  const money = (cents: number) => formatAmount(cents, locale);

  /* An apartment in two names is greeted in both names: it is both of theirs. */
  const values: Record<string, string> = {
    first_name: buyersFirstNames(row.client),
    last_name: row.client.lastName ?? "",
    name: buyersName(row.client),
    unit: row.unit?.code ?? row.contract.reference ?? "",
    project: row.project?.name ?? "",
    amount: money(toCents(row.payment.amount)),
    stage: row.installment?.label ?? "",
    outstanding: money(Math.max(0, outstandingCents)),
    reference: row.contract.reference ?? "",
    receipt_number: row.payment.receiptNumber ?? "",
  };

  const subject = fill(
    (locale === "el" ? template.subjectEl : template.subject) || template.subject || "",
    values,
  );
  let body = fill((locale === "el" ? template.bodyEl : template.body) || template.body, values);
  if (signing?.signed && (signedReservation || key !== "paid_signing")) body = sayAttached(body, PAPER_NAME[signing.kind]);

  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: {
      name: values.name,
      email: row.client.email,
      clientId: row.client.id,
    },
    subject,
    body,
    /* A receipt is not marketing: it is the record of their own money. */
    withOptOut: false,
    attachments: papers,
    /* Copied: the second buyer always, and whoever the office ticked or typed
       when it recorded the money, the bank paying the loan say. */
    cc: emailList(hasSecondBuyer(row.client) ? row.client.secondEmail : null, row.payment.ccEmails),
  });

  if (signing && (result.status === "SENT" || result.status === "SIMULATED")) await markSignedSent(signing.paperId);
  if (result.status === "SENT") await note("SENT", "Sent.");
  else if (result.status === "SIMULATED")
    await note("SKIPPED", result.error ?? "Email is not set up yet, so nothing left the building.");
  else await note("FAILED", result.error ?? "It did not go.");
}

/**
 * The letters that were waiting on this contract's paperwork.
 *
 * Called when a document is filed against a contract. If the signing letter has
 * been sitting waiting for it, it goes now, with the contract attached, which
 * is what the office asked for without anybody having to remember the order.
 */
export async function sendWaitingFor(contractId: string): Promise<void> {
  const waiting = await db
    .select({ id: automaticEmails.id, paymentId: automaticEmails.paymentId })
    .from(automaticEmails)
    .where(and(eq(automaticEmails.contractId, contractId), eq(automaticEmails.status, "WAITING")))
    .orderBy(asc(automaticEmails.createdAt));

  for (const one of waiting) {
    if (one.paymentId) await letterForPayment(one.paymentId);
  }
}

/** Everything the CRM has sent by itself, newest first, for the section. */
export async function automaticHistory(limit = 30) {
  return db
    .select({
      row: automaticEmails,
      client: clients,
      contract: contracts,
    })
    .from(automaticEmails)
    .leftJoin(clients, eq(clients.id, automaticEmails.clientId))
    .leftJoin(contracts, eq(contracts.id, automaticEmails.contractId))
    .orderBy(desc(automaticEmails.createdAt))
    .limit(limit);
}

/* ---------------------------------------------------------------------------
   The letters that follow an appointment
   --------------------------------------------------------------------------- */

/** The six kinds in words, for a letter that carries no stylesheet. */
const KIND_WORDS: Record<string, string> = {
  TIMBER: "Ocriam",
  BATHROOMS_TILES: "Studio Bagno",
  OFFICE: "At our office",
  PHONE_CALL: "A call",
  BUILDING: "At the building",
  OTHER: "",
};

/**
 * Write to whoever the appointment is with.
 *
 * Made, moved, cancelled: the same letter three ways, because those are the
 * three moments a person needs to hear from us. It goes to the client or to the
 * lead, whichever the appointment is with, and it says the one thing that
 * matters, which is where to be and when.
 *
 * Nothing here throws, for the same reason as the money letters: an appointment
 * the office has written down must stay written down whatever the mail server
 * is doing.
 */
export async function letterForAppointment(
  appointmentId: string,
  kind: "made" | "moved" | "cancelled" | "reminder",
): Promise<void> {
  const [row] = await db
    .select({
      appointment: appointments,
      client: clients,
      lead: leads,
      agent: agents,
      project: projects,
      member: teamMembers,
    })
    .from(appointments)
    .leftJoin(clients, eq(clients.id, appointments.clientId))
    .leftJoin(leads, eq(leads.id, appointments.leadId))
    .leftJoin(agents, eq(agents.id, appointments.agentId))
    .leftJoin(projects, eq(projects.id, appointments.projectId))
    .leftJoin(teamMembers, eq(teamMembers.id, appointments.assignedToId))
    .where(eq(appointments.id, appointmentId))
    .limit(1);

  if (!row) return;

  const key =
    kind === "made"
      ? "appointment_made"
      : kind === "moved"
        ? "appointment_moved"
        : kind === "reminder"
          ? "appointment_reminder"
          : "appointment_cancelled";

  const to = row.client
    ? {
        email: row.client.email,
        first: row.client.firstName ?? "",
        name: `${row.client.firstName ?? ""} ${row.client.lastName ?? ""}`.trim(),
        clientId: row.client.id,
      }
    : row.lead
      ? {
          email: row.lead.email,
          first: row.lead.firstName ?? "",
          name: `${row.lead.firstName ?? ""} ${row.lead.lastName ?? ""}`.trim(),
          clientId: null,
        }
      : row.agent
        ? {
            email: row.agent.email,
            first: row.agent.name.split(" ")[0] ?? row.agent.name,
            name: row.agent.name,
            clientId: null,
          }
        : row.appointment.otherName
          ? {
              email: row.appointment.otherEmail,
              first: row.appointment.otherName.split(" ")[0] ?? row.appointment.otherName,
              name: row.appointment.otherName,
              clientId: null,
            }
          : null;

  const note = async (status: "SENT" | "FAILED" | "SKIPPED", reason: string) => {
    await db.insert(automaticEmails).values({
      templateKey: key,
      contractId: null,
      paymentId: null,
      clientId: to?.clientId ?? null,
      /* Which appointment, so a reminder is never sent twice for the same one. */
      appointmentId,
      status,
      reason: `${row.appointment.place}: ${reason}`,
      sentAt: status === "SENT" ? new Date() : null,
    });
  };

  const template = await templateByKey(key);
  if (!template) return;
  if (!template.isActive) {
    await note("SKIPPED", "This letter is switched off in the automatic emails section.");
    return;
  }
  if (!to || !to.email) {
    await note("SKIPPED", "Nobody with an email address is named on this appointment.");
    return;
  }

  const at = new Date(row.appointment.at);
  const values: Record<string, string> = {
    first_name: to.first,
    name: to.name,
    /* At a building, its Google Maps link goes with the place, so nobody is sent
       to whatever the address typed from memory finds. */
    place:
      row.project?.mapsUrl && row.appointment.type === "BUILDING"
        ? `${row.appointment.place}\nOn the map: ${row.project.mapsUrl}`
        : row.appointment.place,
    /* Other says what it was, because "Other" tells the buyer nothing. */
    kind:
      shownCode(row.appointment.type, row.appointment.typeChoice) !== row.appointment.type
        ? await englishWord("appointmentType", row.appointment.typeChoice ?? "")
        : row.appointment.type === "OTHER"
          ? (row.appointment.typeOther ?? "").trim() || "A meeting"
          : (KIND_WORDS[row.appointment.type] ?? row.appointment.type),
    day: at.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" }),
    time: at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
    who: row.member?.name ?? "somebody from the office",
  };

  const subject = fill(template.subject ?? "", values);
  const body = fill(template.body, values);

  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: { name: to.name, email: to.email, clientId: to.clientId ?? undefined },
    subject,
    body,
    withOptOut: false,
    /* An apartment in two names: the second buyer hears about it too. */
    cc: row.client && hasSecondBuyer(row.client) ? emailList(row.client.secondEmail) : [],
  });

  if (result.status === "SENT") await note("SENT", "Sent.");
  else if (result.status === "SIMULATED")
    await note("SKIPPED", result.error ?? "Email is not set up yet, so nothing left the building.");
  else await note("FAILED", result.error ?? "It did not go.");
}

/* ---------------------------------------------------------------------------
   The reminder the day before
   --------------------------------------------------------------------------- */

/**
 * Remind everybody who has an appointment tomorrow.
 *
 * Called every few minutes by the same clock that sends the evening summary,
 * and it answers to itself: it only acts inside the hours the office set, and
 * an appointment that has already had its reminder is never sent another, so
 * calling it a hundred times sends each reminder once.
 *
 * An appointment made in the last six hours is left alone. Somebody who agreed
 * to a meeting at three this afternoon and was sent a confirmation at three
 * does not need a reminder at four saying the same thing.
 */
export async function sendAppointmentReminders(options?: {
  /** Pressed by hand, so the hour does not matter. */
  byHand?: boolean;
  hour?: number;
}): Promise<{ sent: number; looked: number }> {
  const now = new Date();
  const hour = options?.hour ?? 10;
  if (!options?.byHand && (now.getHours() < hour || now.getHours() >= 21)) {
    return { sent: 0, looked: 0 };
  }

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dayAfter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const due = await db
    .select({ id: appointments.id, createdAt: appointments.createdAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.status, "PLANNED"),
        sql`${appointments.at} >= ${tomorrow} and ${appointments.at} < ${dayAfter}`,
      ),
    );

  let sent = 0;
  for (const one of due) {
    if (new Date(one.createdAt) > sixHoursAgo) continue;

    const [already] = await db
      .select({ id: automaticEmails.id })
      .from(automaticEmails)
      .where(
        and(
          eq(automaticEmails.appointmentId, one.id),
          eq(automaticEmails.templateKey, "appointment_reminder"),
        ),
      )
      .limit(1);
    if (already) continue;

    await letterForAppointment(one.id, "reminder");
    sent += 1;
  }

  return { sent, looked: due.length };
}

/* ---------------------------------------------------------------------------
   The letter to the agent
   --------------------------------------------------------------------------- */

/**
 * Tell the agent their commission has been generated.
 *
 * Called after anything that can bring a commission into being, a payment
 * above all, and it looks rather than being told: if this contract now has a
 * commission line and the agent has not been written to about it, the letter
 * goes. That way it does not matter which of the several paths through the CRM
 * created the line, and it is never written twice.
 */
export async function letterForCommission(contractId: string): Promise<void> {
  const [line] = await db
    .select({
      commission: commissions,
      agent: agents,
      contract: contracts,
      client: clients,
      unit: units,
      project: projects,
    })
    .from(commissions)
    .innerJoin(agents, eq(agents.id, commissions.agentId))
    .innerJoin(contracts, eq(contracts.id, commissions.contractId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .where(and(eq(commissions.contractId, contractId), eq(commissions.kind, "RATE")))
    .limit(1);

  if (!line) return;

  const [already] = await db
    .select({ id: automaticEmails.id })
    .from(automaticEmails)
    .where(
      and(
        eq(automaticEmails.contractId, contractId),
        eq(automaticEmails.templateKey, "agent_commission"),
      ),
    )
    .limit(1);
  if (already) return;

  const note = async (status: "SENT" | "FAILED" | "SKIPPED", reason: string) => {
    await db.insert(automaticEmails).values({
      templateKey: "agent_commission",
      contractId,
      clientId: line.client?.id ?? null,
      agentId: line.agent.id,
      status,
      reason: `${line.agent.name}: ${reason}`,
      sentAt: status === "SENT" ? new Date() : null,
    });
  };

  const template = await templateByKey("agent_commission");
  if (!template) return;
  if (!template.isActive) {
    await note("SKIPPED", "This letter is switched off in the automatic emails section.");
    return;
  }
  if (!line.agent.email) {
    await note("SKIPPED", "The agent has no email address on their record.");
    return;
  }

  const money = (cents: number) => formatAmount(cents, "en");
  const values: Record<string, string> = {
    first_name: line.agent.name.split(" ")[0] ?? line.agent.name,
    name: line.agent.name,
    buyer: line.client ? `${line.client.firstName ?? ""} ${line.client.lastName ?? ""}`.trim() : "The buyer",
    unit: line.unit?.code ?? line.contract.reference ?? "",
    project: line.project?.name ?? "",
    amount: money(toCents(line.commission.amount)),
    base: `${Number(line.commission.rate)}% of ${money(toCents(line.commission.baseAmount))}`,
  };

  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: { name: line.agent.name, email: line.agent.email, agentId: line.agent.id },
    subject: fill(template.subject ?? "", values),
    body: fill(template.body, values),
    withOptOut: false,
  });

  if (result.status === "SENT") await note("SENT", "Sent.");
  else if (result.status === "SIMULATED")
    await note("SKIPPED", result.error ?? "Email is not set up yet, so nothing left the building.");
  else await note("FAILED", result.error ?? "It did not go.");
}

/* ---------------------------------------------------------------------------
   Birthday wishes
   --------------------------------------------------------------------------- */

/**
 * Wish every client a happy birthday, on the day.
 *
 * Called by the same ten minute clock as the reminders, and it answers to
 * itself: nothing before the hour the office set (nine in the morning unless
 * changed) or after nine at night, and each person once a year, the main buyer
 * and the second buyer each on their own birthday. A wish that could not go is
 * written down with why, and is not tried again that year, so a client without
 * an email address is not looked at every ten minutes all day.
 */
export async function sendBirthdayWishes(options?: { byHand?: boolean; hour?: number }): Promise<{ sent: number; looked: number }> {
  const now = new Date();
  const hour = options?.hour ?? 9;
  if (!options?.byHand && (now.getHours() < hour || now.getHours() >= 21)) return { sent: 0, looked: 0 };

  const template = await templateByKey("birthday");
  if (!template) return { sent: 0, looked: 0 };

  const year = now.getFullYear();
  const people = await db
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      birthDate: clients.birthDate,
      secondFirstName: clients.secondFirstName,
      secondLastName: clients.secondLastName,
      secondEmail: clients.secondEmail,
      secondBirthDate: clients.secondBirthDate,
    })
    .from(clients)
    .where(
      and(
        sql`${clients.deletedAt} is null`,
        sql`${clients.closedAt} is null`,
        sql`(${clients.birthDate} is not null or ${clients.secondBirthDate} is not null)`,
      ),
    );

  let sent = 0;
  let looked = 0;
  for (const person of people) {
    for (const second of [false, true]) {
      const born = second ? person.secondBirthDate : person.birthDate;
      if (!isBirthday(born, now)) continue;
      const first = (second ? person.secondFirstName : person.firstName) ?? "";
      const last = (second ? person.secondLastName : person.lastName) ?? "";
      if (second && !first.trim()) continue;
      looked += 1;

      const [already] = await db
        .select({ id: automaticEmails.id })
        .from(automaticEmails)
        .where(
          and(
            eq(automaticEmails.templateKey, "birthday"),
            eq(automaticEmails.clientId, person.id),
            eq(automaticEmails.forYear, year),
            eq(automaticEmails.secondBuyer, second),
          ),
        )
        .limit(1);
      if (already) continue;

      const note = async (status: "SENT" | "FAILED" | "SKIPPED", reason: string) => {
        await db.insert(automaticEmails).values({
          templateKey: "birthday",
          clientId: person.id,
          forYear: year,
          secondBuyer: second,
          status,
          reason,
          sentAt: status === "SENT" ? new Date() : null,
        });
      };

      if (!template.isActive) {
        await note("SKIPPED", "Birthday wishes are switched off in the automatic emails section.");
        continue;
      }
      const email = second ? person.secondEmail : person.email;
      if (!email) {
        await note("SKIPPED", `${second ? "The second buyer has" : "The client has"} no email address on the record.`);
        continue;
      }

      const values = { first_name: first.trim(), last_name: last.trim(), name: `${first} ${last}`.trim() };
      const result = await sendAndRecord({
        channel: "EMAIL",
        recipient: { name: values.name, email, clientId: person.id },
        subject: fill(template.subject ?? "", values),
        body: fill(template.body, values),
        withOptOut: false,
      });
      if (result.status === "SENT") {
        await note("SENT", second ? "Sent to the second buyer." : "Sent.");
        sent += 1;
      } else if (result.status === "SIMULATED") {
        await note("SKIPPED", result.error ?? "Email is not set up yet, so nothing left the building.");
      } else {
        await note("FAILED", result.error ?? "It did not go.");
      }
    }
  }
  return { sent, looked };
}

/* ---------------------------------------------------------------------------
   The agent hears about the person they brought
   --------------------------------------------------------------------------- */

/**
 * Tell an agent that their potential client, or their client, is on our books.
 *
 * Called whenever a lead or a client is saved with an agent on it: when it is
 * first written down, when an agent is named on it later, and when a lead of
 * theirs becomes a client. It looks before it writes, so each agent hears
 * about each lead once and about each client once, however many times the
 * record is saved.
 */
export async function letterToAgent(kind: "lead" | "client", id: string): Promise<void> {
  try {
    const key = kind === "lead" ? "agent_new_lead" : "agent_new_client";
    let agentId: string | null = null;
    let name = "";
    let interest = "";
    let who = "our office";
    let clientId: string | null = null;
    let leadId: string | null = null;

    if (kind === "lead") {
      const [row] = await db
        .select({ lead: leads, member: teamMembers, project: projects })
        .from(leads)
        .leftJoin(teamMembers, eq(teamMembers.id, leads.assignedToId))
        .leftJoin(projects, eq(projects.id, leads.projectId))
        .where(eq(leads.id, id))
        .limit(1);
      if (!row) return;
      agentId = row.lead.agentId;
      name = `${row.lead.firstName ?? ""} ${row.lead.lastName ?? ""}`.trim() || row.lead.email || "";
      interest = row.lead.interest || row.lead.projectName || row.project?.name || "";
      if (row.member?.name) who = row.member.name;
      leadId = id;
    } else {
      const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
      if (!row) return;
      agentId = row.agentId;
      name = buyersName(row);
      clientId = id;
      /* What they are interested in: the apartments they hold, or what the lead asked about. */
      const held = await db
        .select({ code: units.code, project: projects.name })
        .from(units)
        .innerJoin(projects, eq(projects.id, units.projectId))
        .where(eq(units.clientId, id));
      if (held.length > 0) interest = held.map((one) => `${one.project} ${one.code}`).join(", ");
      else {
        const [lead] = await db.select().from(leads).where(eq(leads.clientId, id)).limit(1);
        interest = lead?.interest || lead?.projectName || "";
      }
    }
    if (!agentId) return;
    if (!interest) interest = "to be confirmed";

    const [already] = await db
      .select({ id: automaticEmails.id })
      .from(automaticEmails)
      .where(
        and(
          eq(automaticEmails.templateKey, key),
          eq(automaticEmails.agentId, agentId),
          kind === "lead" ? eq(automaticEmails.leadId, id) : eq(automaticEmails.clientId, id),
        ),
      )
      .limit(1);
    if (already) return;

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (!agent) return;

    const note = async (status: "SENT" | "FAILED" | "SKIPPED", reason: string) => {
      await db.insert(automaticEmails).values({
        templateKey: key,
        agentId,
        clientId,
        leadId,
        status,
        reason: `${name}: ${reason}`,
        sentAt: status === "SENT" ? new Date() : null,
      });
    };

    const template = await templateByKey(key);
    if (!template) return;
    if (!template.isActive) return note("SKIPPED", "This letter is switched off in the automatic emails section.");
    if (!agent.email) return note("SKIPPED", "The agent has no email address on their record.");

    const values = {
      first_name: agent.name.split(" ")[0] ?? agent.name,
      name,
      interest,
      who,
    };
    const result = await sendAndRecord({
      channel: "EMAIL",
      recipient: { name: agent.name, email: agent.email, agentId: agent.id },
      subject: fill(template.subject ?? "", values),
      body: fill(template.body, values),
      withOptOut: false,
    });
    if (result.status === "SENT") await note("SENT", "Sent.");
    else if (result.status === "SIMULATED") await note("SKIPPED", result.error ?? "Email is not set up yet, so nothing left the building.");
    else await note("FAILED", result.error ?? "It did not go.");
  } catch (error) {
    console.error("[agent letter]", error);
  }
}
