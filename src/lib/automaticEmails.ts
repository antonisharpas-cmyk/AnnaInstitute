import "server-only";
import { agentTextChannel, textChannelOf } from "@/lib/textChannel";
import { stageFrom, stageNames } from "@/lib/choices/stages";
import { englishWord, shownCode } from "@/lib/choices";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  appointments,
  automaticEmails,
  clients,
  commissions,
  constructorProjects,
  constructors,
  contracts,
  documents,
  installments,
  leads,
  partners,
  payments,
  projects,
  signingPapers,
  subownerDirectors,
  subownerShares,
  teamMembers,
  units,
} from "@/db/schema";
import { formatAmount, toCents } from "@/lib/money";
import { sendAndRecord } from "@/lib/messaging";
import { resolveStored } from "@/lib/storage";
import { templateByKey, type AutomaticKey } from "@/lib/templates";
import { advanceInvoiceFor, issuedAttachments, issueForPayment, paperAttachment } from "@/lib/issued";
import { markSignedSent, PAPER_NAME, paperForPayment } from "@/lib/signingPapers";
import type { EmailAttachment } from "@/lib/messaging/email";
import { buyersFirstNames, buyersName, cleanBirthDate, emailList, hasSecondBuyer, isBirthday } from "@/lib/buyers";
import { groupPeople, handlesOf, sameEmail } from "@/lib/samePerson";
import { invoiceWentFor } from "@/lib/stageInvoices";
import { titleWord } from "@/lib/titles";
import { issuerForProject } from "@/lib/issuer";
import { readSetting, writeSetting } from "@/lib/settings";

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
  /* "Dear {{title}} {{first_name}}" reads "Dear Maria" when there is no title. */
  let words = Object.hasOwn(values, "title") && !values.title ? text.replace(/\{\{\s*title\s*\}\}[ \t]?/g, "") : text;
  /* No contractor on the development: "the company, which", never "the company , which". */
  if (Object.hasOwn(values, "constructor") && !values["constructor"]) words = words.replace(/[ \t]?\{\{\s*constructor\s*\}\}/g, "");
  return words.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) => (Object.hasOwn(values, key) ? values[key] : undefined) ?? whole);
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
  await receiptLetter(paymentId);
  /* The receipt of the signing went, or was noted as not going: the welcome follows, if the Contract of Sale is signed. */
  const [paid] = await db.select({ contractId: payments.contractId }).from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (paid?.contractId) await welcomeAfterSale(paid.contractId, paymentId);
}

async function receiptLetter(paymentId: string): Promise<void> {
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
  /*
   * The invoice of this stage went to the buyer before the money, with the
   * signed paper or the architect's certificate. The letter for the money is
   * then the receipt: it waits for nothing, carries nothing they have already,
   * and the signing letter, which speaks of the contract being attached, reads
   * as the ordinary payment letter instead.
   */
  const invoiceWent = Boolean(row.installment?.invoiceSentAt) || (await invoiceWentFor(row.installment?.id));
  const chosen = letterFor({
    counted,
    stage: row.installment?.label ?? null,
    outstandingCents: dueCents > 0 ? outstandingCents : 1,
  });
  /*
   * The Reservation or the Contract of Sale paid with this stage. The agreed
   * paper went to the buyer with its invoice before they signed, so the letter
   * for the money is the receipt with the signed copy: it waits for the signed
   * copy, and goes the moment it is uploaded. A stage with no paper on its way
   * whose invoice went already reads as the ordinary payment letter.
   */
  const signing = await paperForPayment(row.contract.id, row.payment.installmentId, counted);
  const key = invoiceWent && chosen === "paid_signing" && !signing ? "paid_installment" : chosen;

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
 * The welcome, once the sale is real.
 *
 * Two things have to be true, in either order: the Contract of Sale is signed,
 * and the receipt for the signing installment has gone to the buyer. Whichever
 * happens second sends it: the receipt letter calls this with its payment, and
 * uploading the signed Contract of Sale calls it with none. It goes once a
 * contract. Called for anything else, an installment years later, it does
 * nothing, so the buyers of contracts signed before this letter existed are
 * never welcomed out of the blue.
 */
export async function welcomeAfterSale(contractId: string, paymentId?: string): Promise<void> {
  try {
    const [row] = await db
      .select({ contract: contracts, client: clients, unit: units, project: projects })
      .from(contracts)
      .leftJoin(clients, eq(clients.id, contracts.clientId))
      .leftJoin(units, eq(units.id, contracts.unitId))
      .leftJoin(projects, eq(projects.id, units.projectId))
      .where(eq(contracts.id, contractId))
      .limit(1);
    if (!row || row.contract.kind === "LAND_EXCHANGE" || row.contract.status === "CANCELLED") return;

    /* Once a contract: a welcome already sent, or noted as not going, is the answer. */
    const [already] = await db
      .select()
      .from(automaticEmails)
      .where(and(eq(automaticEmails.contractId, contractId), eq(automaticEmails.templateKey, "welcome_contract")))
      .limit(1);
    if (already && already.status !== "FAILED") return;

    /* The signing installment: the one the Contract of Sale is paid with, or the line that reads as the signing. */
    const papers = await db.select().from(signingPapers).where(eq(signingPapers.contractId, contractId));
    const sale = papers.find((one) => one.kind === "SALE");
    const lines = await db.select().from(installments).where(eq(installments.contractId, contractId));
    const names = await stageNames();
    const signingLines = sale?.installmentId
      ? [sale.installmentId]
      : lines.filter((one) => stageFrom(names, one.label, one.labelEl) === "SIGNING").map((one) => one.id);
    if (signingLines.length === 0) return;

    /* Called by a payment: only a payment of the signing installment. */
    const signingPayments = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.contractId, contractId), inArray(payments.installmentId, signingLines)));
    if (paymentId && !signingPayments.some((one) => one.id === paymentId)) return;
    if (signingPayments.length === 0) return;

    /* The receipt has gone: its letter was sent, or noted as not going (switched off, no address). */
    const receipts = await db
      .select({ status: automaticEmails.status })
      .from(automaticEmails)
      .where(inArray(automaticEmails.paymentId, signingPayments.map((one) => one.id)));
    if (!receipts.some((one) => one.status === "SENT" || one.status === "SKIPPED")) return;

    /* The Contract of Sale is signed: its signed copy on the contract, or the contract filed the older way. */
    const [filed] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.contractId, contractId), eq(documents.category, "CONTRACT")))
      .limit(1);
    if (!sale?.signedDocumentId && !filed) return;

    const note = async (status: "SENT" | "FAILED" | "SKIPPED", reason: string) => {
      const values = {
        templateKey: "welcome_contract",
        contractId,
        paymentId: null,
        clientId: row.client?.id ?? null,
        status,
        reason,
        sentAt: status === "SENT" ? new Date() : null,
        updatedAt: new Date(),
      };
      if (already) await db.update(automaticEmails).set(values).where(eq(automaticEmails.id, already.id));
      else await db.insert(automaticEmails).values(values);
    };

    const template = await templateByKey("welcome_contract");
    if (!template) return;
    if (!template.isActive) {
      await note("SKIPPED", "This letter is switched off in the automatic emails section.");
      return;
    }
    if (!row.client?.email) {
      await note("SKIPPED", "The buyer has no email address on their record.");
      return;
    }

    /* The contractor building the development, from Constructors. */
    const [builder] = row.project
      ? await db
          .select({ name: constructors.name, company: constructors.company })
          .from(constructorProjects)
          .innerJoin(constructors, eq(constructors.id, constructorProjects.constructorId))
          .where(and(eq(constructorProjects.projectId, row.project.id), isNotNull(constructors.id)))
          .limit(1)
      : [];

    /* Two buyers are greeted by both first names, without a title. */
    const two = hasSecondBuyer(row.client);
    const values: Record<string, string> = {
      title: two ? "" : titleWord(row.client.title),
      first_name: buyersFirstNames(row.client),
      last_name: row.client.lastName ?? "",
      name: buyersName(row.client),
      unit: row.unit?.code ?? row.contract.reference ?? "",
      project: row.project?.name ?? "",
      reference: row.contract.reference ?? "",
      constructor: builder?.company?.trim() || builder?.name?.trim() || "",
    };

    const result = await sendAndRecord({
      channel: "EMAIL",
      recipient: { name: values.name, email: row.client.email, clientId: row.client.id },
      subject: fill(template.subject || "", values),
      body: fill(template.body, values),
      withOptOut: false,
      cc: emailList(two ? row.client.secondEmail : null),
    });
    if (result.status === "SENT") await note("SENT", "Sent.");
    else if (result.status === "SIMULATED") await note("SKIPPED", result.error ?? "Email is not set up yet, so nothing left the building.");
    else await note("FAILED", result.error ?? "It did not go.");
  } catch (error) {
    console.error("[welcome] could not be handled", contractId, error);
  }
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
      partner: partners,
      project: projects,
      member: teamMembers,
    })
    .from(appointments)
    .leftJoin(clients, eq(clients.id, appointments.clientId))
    .leftJoin(leads, eq(leads.id, appointments.leadId))
    .leftJoin(agents, eq(agents.id, appointments.agentId))
    .leftJoin(partners, eq(partners.id, appointments.partnerId))
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
        phone: row.client.phone,
        first: row.client.firstName ?? "",
        name: `${row.client.firstName ?? ""} ${row.client.lastName ?? ""}`.trim(),
        clientId: row.client.id,
      }
    : row.lead
      ? {
          email: row.lead.email,
          phone: row.lead.phone,
          first: row.lead.firstName ?? "",
          name: `${row.lead.firstName ?? ""} ${row.lead.lastName ?? ""}`.trim(),
          clientId: null,
        }
      : row.agent
        ? {
            email: row.agent.email,
            phone: row.agent.phone,
            first: row.agent.name.split(" ")[0] ?? row.agent.name,
            name: row.agent.name,
            clientId: null,
          }
        : row.partner
          ? {
              /* A partner hears by email only, never by SMS. */
              email: row.partner.email,
              phone: null,
              first: row.partner.name.split(" ")[0] ?? row.partner.name,
              name: row.partner.name,
              clientId: null,
            }
        : row.appointment.otherName
          ? {
              email: row.appointment.otherEmail,
              phone: row.appointment.otherPhone,
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
  const phone = to?.phone?.trim() || null;
  if (!to || (!to.email && !phone)) {
    await note("SKIPPED", "Nobody with an email address or a mobile number is named on this appointment.");
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

  /* The email, when there is an address. */
  let email: Awaited<ReturnType<typeof sendAndRecord>> | null = null;
  if (to.email) {
    email = await sendAndRecord({
      channel: "EMAIL",
      recipient: { name: to.name, email: to.email, clientId: to.clientId ?? undefined },
      subject,
      body,
      withOptOut: false,
      /* An apartment in two names: the second buyer hears about it too. */
      cc: row.client && hasSecondBuyer(row.client) ? emailList(row.client.secondEmail) : [],
    });
  }

  /* And the same news as an SMS, short, to the mobile on the record, unless
     the client or lead is set to no texts. The place is given without the map
     link, which would make the text run long. */
  const textBy = row.client
    ? textChannelOf(row.client.textChannel)
    : row.lead
      ? textChannelOf(row.lead.textChannel)
      : row.agent
        ? agentTextChannel()
        : "SMS";
  let text: Awaited<ReturnType<typeof sendAndRecord>> | null = null;
  const short = (template.bodyWhatsapp ?? "").trim();
  /* A client or lead set to no texts hears by email only. */
  if (phone && short && textBy !== "NONE") {
    text = await sendAndRecord({
      channel: textBy,
      recipient: { name: to.name, phone, clientId: to.clientId ?? undefined, leadId: row.lead?.id ?? undefined },
      body: fill(short, { ...values, place: row.appointment.place }),
      withOptOut: false,
    });
  }

  const said = (one: typeof email, what: string) =>
    !one
      ? null
      : one.status === "SENT"
        ? `${what} sent`
        : one.status === "SIMULATED"
          ? `${what} not set up, nothing went`
          : `${what} did not go: ${one.error ?? one.status}`;
  const textWord = (text?.usedChannel ?? textBy) === "WHATSAPP" ? "WhatsApp" : "SMS";
  const noTexts = textBy === "NONE" && phone && short ? "No text, as they are set to no texts" : null;
  const reason = [said(email, "Email"), said(text, textWord), noTexts].filter(Boolean).join(". ") + ".";
  const anySent = email?.status === "SENT" || text?.status === "SENT";
  const anyFailed = email?.status === "FAILED" || text?.status === "FAILED";
  await note(anySent ? "SENT" : anyFailed ? "FAILED" : "SKIPPED", reason);
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

  /*
   * Paid in cash: there is no invoice to ask the agent for, so the letter does
   * not go. Nothing is written down either, so that a contract changed back to
   * an invoice later still sends its letter then.
   */
  if (line.contract.commissionInCash) return;

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
    title: titleWord(line.agent.title),
    first_name: line.agent.name.split(" ")[0] ?? line.agent.name,
    name: line.agent.name,
    buyer: line.client ? `${line.client.firstName ?? ""} ${line.client.lastName ?? ""}`.trim() : "The buyer",
    unit: line.unit?.code ?? line.contract.reference ?? "",
    project: line.project?.name ?? "",
    amount: money(toCents(line.commission.amount)),
    base:
      line.contract.commissionFixed != null
        ? `a fixed amount agreed for this sale (the sale is ${money(toCents(line.commission.baseAmount))})`
        : `${Number(line.commission.rate)}% of ${money(toCents(line.commission.baseAmount))}`,
    /* The company the agent makes the invoice out to: the one that holds the development, or One Eleven. */
    company: (await issuerForProject(line.project?.id ?? null)).name,
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

/*
 * Everybody the office wishes, from every list at once, put together into
 * persons. Used by the wishes themselves and by the list of birthdays to come,
 * so the list always shows exactly who the wishes will go to.
 */
export type BirthdayPerson = {
  /** How the wish is written down: a client (main or second buyer), or somebody else. */
  clientId: string | null;
  second: boolean;
  personKey: string | null;
  agentId: string | null;
  /** Where the record is, for the list of birthdays to come. */
  href: string;
  what: string;
  first: string;
  last: string;
  email: string | null;
  phone: string | null;
  born: string | null;
};
const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? name.trim(), last: parts.slice(1).join(" ") };
};


async function birthdayPeople(year: number) {
  /*
   * Everybody the office wishes, from every list at once: the clients and
   * their second buyers, the agents, the team, the shareholders who are people
   * and the directors. One person is often on several of them, so they are
   * first put together into persons, by any email address or mobile number two
   * records share, and each person is wished once a year, whichever list they
   * were wished from and on whichever day a record says their birthday is.
   */
  const [clientRows, agentRows, teamRows, holderRows, directorRows, wishedRows] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(
        and(
          sql`${clients.deletedAt} is null`,
          sql`${clients.closedAt} is null`,
          sql`(${clients.birthDate} is not null or ${clients.secondBirthDate} is not null)`,
        ),
      ),
    db.select().from(agents).where(and(eq(agents.isActive, true), sql`${agents.birthDate} is not null`)),
    db.select().from(teamMembers).where(and(eq(teamMembers.isActive, true), sql`${teamMembers.birthDate} is not null`)),
    db.select().from(subownerShares).where(and(eq(subownerShares.isOneEleven, false), sql`${subownerShares.birthDate} is not null`)),
    db.select().from(subownerDirectors).where(sql`${subownerDirectors.birthDate} is not null`),
    db
      .select({
        clientId: automaticEmails.clientId,
        second: automaticEmails.secondBuyer,
        personKey: automaticEmails.personKey,
        status: automaticEmails.status,
        reason: automaticEmails.reason,
        at: automaticEmails.createdAt,
      })
      .from(automaticEmails)
      .where(and(eq(automaticEmails.templateKey, "birthday"), eq(automaticEmails.forYear, year))),
  ]);

  const people: BirthdayPerson[] = [];
  for (const one of clientRows) {
    if (one.birthDate)
      people.push({ clientId: one.id, second: false, personKey: null, agentId: null, href: `/clients/${one.id}`, what: "client", first: one.firstName ?? "", last: one.lastName ?? "", email: one.email, phone: one.phone, born: one.birthDate });
    if (one.secondBirthDate && (one.secondFirstName ?? "").trim())
      people.push({ clientId: one.id, second: true, personKey: null, agentId: null, href: `/clients/${one.id}`, what: "second buyer", first: one.secondFirstName ?? "", last: one.secondLastName ?? "", email: one.secondEmail, phone: one.secondPhone, born: one.secondBirthDate });
  }
  for (const one of agentRows) people.push({ clientId: null, second: false, personKey: `agent:${one.id}`, agentId: one.id, href: `/agents/${one.id}`, what: "agent", ...splitName(one.name), email: one.email, phone: one.phone, born: one.birthDate });
  for (const one of teamRows) people.push({ clientId: null, second: false, personKey: `team:${one.id}`, agentId: null, href: "/team", what: "team member", ...splitName(one.name), email: one.email, phone: one.phone, born: one.birthDate });
  for (const one of holderRows.filter((row) => row.holderKind !== "COMPANY"))
    people.push({ clientId: null, second: false, personKey: `holder:${one.id}`, agentId: null, href: `/subowners/${one.subownerId}`, what: "shareholder", ...splitName(one.holder), email: one.email, phone: one.phone, born: one.birthDate });
  for (const one of directorRows)
    people.push({ clientId: null, second: false, personKey: `director:${one.id}`, agentId: null, href: `/subowners/${one.subownerId}`, what: "director", ...splitName(one.name), email: one.email || one.emailAlternate, phone: one.phone, born: one.birthDate });

  /*
   * Who is who: one group per person. Two records are the same person when
   * they share an email address or a mobile number and have the same birthday.
   * The birthday is part of it on purpose: an office number or an info@ address
   * shared by two directors does not make them one person, and they are not
   * born on the same day.
   */
  const dayOf = (born: string | null) => (cleanBirthDate(born) ?? "").slice(5);
  const group = groupPeople(
    people.map((one, i) => {
      const day = dayOf(one.born);
      const handles = day ? handlesOf({ email: one.email, phone: one.phone }).map((handle) => `${day}|${handle}`) : [];
      /* With neither an address nor a number, a record is a person of its own. */
      return handles.length ? handles : [`only:${i}`];
    }),
  );
  const rowOf = (one: BirthdayPerson) =>
    wishedRows.find((row) =>
      one.personKey ? row.personKey === one.personKey : row.clientId === one.clientId && row.second === one.second && !row.personKey,
    );
  /* A person already wished this year, on any of their records. */
  const wishedGroups = new Set<number>();
  people.forEach((one, i) => {
    if (rowOf(one)?.status === "SENT") wishedGroups.add(group[i]);
  });

  return { people, group, wishedRows, rowOf, wishedGroups };
}

export type UpcomingBirthday = {
  day: Date;
  /** The person as the wish names them. */
  name: string;
  /** Every record the person is on, with where it is. */
  records: { what: string; name: string; href: string }[];
  age: number | null;
  email: string | null;
  /**
   * SENT, FAILED or SKIPPED once the day has come and the wish was looked at;
   * TODAY or DUE before; NO_EMAIL when it cannot go; OFF when wishes are off.
   */
  state: "SENT" | "FAILED" | "SKIPPED" | "TODAY" | "DUE" | "NO_EMAIL" | "OFF";
  reason: string | null;
  at: Date | null;
};

/**
 * The birthdays to come, day by day from today: one line per person, as the
 * wishes will see them, and what will happen on the day.
 */
export async function upcomingBirthdays(days = 30): Promise<UpcomingBirthday[]> {
  const template = await templateByKey("birthday");
  const on = Boolean(template?.isActive);
  const now = new Date();
  const byYear = new Map<number, Awaited<ReturnType<typeof birthdayPeople>>>();
  const out: UpcomingBirthday[] = [];

  for (let n = 0; n < days; n++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, 12);
    const year = day.getFullYear();
    if (!byYear.has(year)) byYear.set(year, await birthdayPeople(year));
    const { people, group, rowOf } = byYear.get(year)!;

    const groups = new Map<number, number[]>();
    people.forEach((one, i) => {
      if (!isBirthday(one.born, day)) return;
      groups.set(group[i], [...(groups.get(group[i]) ?? []), i]);
    });

    for (const members of groups.values()) {
      const records = members.map((i) => people[i]);
      const main = records.find((one) => one.what === "client") ?? records[0];
      const email = records.map((one) => sameEmail(one.email)).find(Boolean) ?? null;
      const rows = records.map((one) => rowOf(one)).filter(Boolean) as NonNullable<ReturnType<typeof rowOf>>[];
      const sentRow = rows.find((row) => row.status === "SENT");
      const lastRow = sentRow ?? rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
      const born = cleanBirthDate(main.born);
      const state: UpcomingBirthday["state"] = lastRow
        ? (lastRow.status as "SENT" | "FAILED" | "SKIPPED")
        : !on
          ? "OFF"
          : !email
            ? "NO_EMAIL"
            : n === 0
              ? "TODAY"
              : "DUE";
      out.push({
        day,
        name: `${main.first} ${main.last}`.trim(),
        records: records.map((one) => ({ what: one.what, name: `${one.first} ${one.last}`.trim(), href: one.href })),
        age: born ? year - Number(born.slice(0, 4)) : null,
        email,
        state,
        reason: lastRow?.reason ?? null,
        at: lastRow ? new Date(lastRow.at) : null,
      });
    }
  }
  return out;
}

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

  const { people, group, rowOf, wishedGroups } = await birthdayPeople(year);

  let sent = 0;
  let looked = 0;
  for (const [i, person] of people.entries()) {
    if (!isBirthday(person.born, now)) continue;
    looked += 1;
    /* This record has been looked at this year already, whatever came of it. */
    if (rowOf(person)) continue;
    const name = `${person.first} ${person.last}`.trim();

    const note = async (status: "SENT" | "FAILED" | "SKIPPED", reason: string) => {
      await db.insert(automaticEmails).values({
        templateKey: "birthday",
        clientId: person.clientId,
        secondBuyer: person.second,
        personKey: person.personKey,
        agentId: person.agentId,
        forYear: year,
        status,
        reason: person.personKey ? `${name}: ${reason}` : reason,
        sentAt: status === "SENT" ? new Date() : null,
      });
    };

    if (wishedGroups.has(group[i])) {
      await note("SKIPPED", "Already wished this year: the same person is on the CRM another way, with the same email or mobile.");
      continue;
    }
    if (!template.isActive) {
      await note("SKIPPED", "Birthday wishes are switched off in the automatic emails section.");
      continue;
    }
    /* Their own address, or failing that, one the same person has on another record. */
    const email =
      sameEmail(person.email) ??
      people.map((other, j) => (group[j] === group[i] ? sameEmail(other.email) : null)).find(Boolean) ??
      null;
    if (!email) {
      await note("SKIPPED", `No email address on the record of this ${person.what}.`);
      continue;
    }

    const values = { first_name: person.first.trim(), last_name: person.last.trim(), name };
    const result = await sendAndRecord({
      channel: "EMAIL",
      recipient: { name, email, clientId: person.clientId ?? undefined, agentId: person.agentId ?? undefined },
      subject: fill(template.subject ?? "", values),
      body: fill(template.body, values),
      withOptOut: false,
    });
    if (result.status === "SENT") {
      wishedGroups.add(group[i]);
      await note("SENT", person.second ? "Sent to the second buyer." : "Sent.");
      sent += 1;
    } else if (result.status === "SIMULATED") {
      await note("SKIPPED", result.error ?? "Email is not set up yet, so nothing left the building.");
    } else {
      await note("FAILED", result.error ?? "It did not go.");
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
export async function letterToAgent(kind: "lead", id: string): Promise<void> {
  try {
    const key = "agent_new_lead";
    let agentId: string | null = null;
    let name = "";
    let interest = "";
    let who = "our office";
    const clientId: string | null = null;
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
          eq(automaticEmails.leadId, id),
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
      title: titleWord(agent.title),
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

/**
 * The reminder to a lead, sent when somebody presses the button on the lead's
 * page. Never by itself. It answers with what happened, for the message on the
 * screen, and is written in the list of automatic emails and the lead's history.
 */
export async function sendLeadReminder(leadId: string): Promise<{ ok: boolean; said: string }> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return { ok: false, said: "The lead is not there any more." };
  const email = lead.email?.trim();
  if (!email) return { ok: false, said: "The lead has no email address." };
  const template = await templateByKey("lead_reminder");
  if (!template) return { ok: false, said: "The reminder letter is not there." };
  if (!template.isActive) return { ok: false, said: "The reminder is switched off in Automatic emails." };

  const name = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || email;
  const values: Record<string, string> = {
    /* A lead has no Mr or Mrs on its record, so the greeting is the first name. */
    title: "",
    first_name: (lead.firstName ?? "").trim() || name,
    last_name: lead.lastName ?? "",
    name,
  };
  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: { name, email, leadId: lead.id },
    subject: fill(template.subject || "", values),
    body: fill(template.body, values),
    withOptOut: false,
  });
  const status = result.status === "SENT" ? "SENT" : result.status === "SIMULATED" ? "SKIPPED" : "FAILED";
  const reason =
    result.status === "SENT"
      ? "Sent."
      : (result.error ?? (result.status === "SIMULATED" ? "Email is not set up yet, so nothing left the building." : "It did not go."));
  await db.insert(automaticEmails).values({
    templateKey: "lead_reminder",
    leadId: lead.id,
    status,
    reason: `${name}: ${reason}`,
    sentAt: status === "SENT" ? new Date() : null,
  });
  return { ok: result.status === "SENT", said: result.status === "SENT" ? `to ${email}` : reason };
}

/**
 * The follow up to the agent who brought a lead, sent when somebody presses
 * the button on the lead's page. Never by itself, and as often as the office
 * presses it. The agent reads about "your client": the word lead is ours, not
 * theirs. Written in the list of automatic emails, the agent's communication
 * and the lead's history.
 */
export async function sendAgentFollowUp(leadId: string): Promise<{ ok: boolean; said: string }> {
  const [row] = await db
    .select({ lead: leads, agent: agents })
    .from(leads)
    .leftJoin(agents, eq(agents.id, leads.agentId))
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!row) return { ok: false, said: "The lead is not there any more." };
  const { lead, agent } = row;
  if (!agent) return { ok: false, said: "No agent is named on this lead." };
  const email = agent.email?.trim();
  if (!email) return { ok: false, said: `${agent.name} has no email address on their record.` };
  const template = await templateByKey("agent_follow_up");
  if (!template) return { ok: false, said: "The follow up letter is not there." };
  if (!template.isActive) return { ok: false, said: "The follow up to the agent is switched off in Automatic emails." };

  const client = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || lead.email || "";
  const values: Record<string, string> = {
    title: titleWord(agent.title),
    first_name: agent.name.split(" ")[0] ?? agent.name,
    name: client,
  };
  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: { name: agent.name, email, agentId: agent.id, leadId: lead.id },
    subject: fill(template.subject || "", values),
    body: fill(template.body, values),
    withOptOut: false,
  });
  const status = result.status === "SENT" ? "SENT" : result.status === "SIMULATED" ? "SKIPPED" : "FAILED";
  const reason =
    result.status === "SENT"
      ? "Sent."
      : (result.error ?? (result.status === "SIMULATED" ? "Email is not set up yet, so nothing left the building." : "It did not go."));
  await db.insert(automaticEmails).values({
    templateKey: "agent_follow_up",
    agentId: agent.id,
    leadId: lead.id,
    status,
    reason: `${agent.name}, about ${client}: ${reason}`,
    sentAt: status === "SENT" ? new Date() : null,
  });
  return { ok: result.status === "SENT", said: result.status === "SENT" ? `${agent.name}, ${email}` : reason };
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * The reminders for unpaid invoices.
 *
 * Ten days after the invoice of a stage went to the buyer, if that stage is
 * still not paid in full, the buyer gets one kind reminder with the invoice
 * attached again. Once a stage, whatever came of it. It rides on the same
 * clock as the birthday wishes, from ten in the morning.
 *
 * Invoices sent before this letter existed are left alone: the first time it
 * runs it remembers the day, less ten days, and only invoices sent since then
 * are ever chased, so nobody gets a reminder for an invoice of last year.
 */
export async function sendInvoiceReminders(options?: { byHand?: boolean; hour?: number }): Promise<{ sent: number; looked: number }> {
  const now = new Date();
  const hour = options?.hour ?? 10;
  if (!options?.byHand && (now.getHours() < hour || now.getHours() >= 20)) return { sent: 0, looked: 0 };

  const template = await templateByKey("invoice_reminder");
  if (!template || !template.isActive) return { sent: 0, looked: 0 };

  let sinceText = await readSetting("invoiceReminders.since");
  if (!sinceText) {
    sinceText = new Date(now.getTime() - 10 * DAY).toISOString();
    await writeSetting("invoiceReminders.since", sinceText);
  }
  const since = new Date(sinceText);
  const dueBy = new Date(now.getTime() - 10 * DAY);

  /* The stages whose invoice went between then and ten days ago, from the stage itself or from its paper's box. */
  const fromLines = await db
    .select({ id: installments.id })
    .from(installments)
    .where(and(isNotNull(installments.invoiceSentAt), gte(installments.invoiceSentAt, since), lte(installments.invoiceSentAt, dueBy)));
  const fromPapers = await db
    .select({ id: signingPapers.installmentId })
    .from(signingPapers)
    .where(
      and(
        isNotNull(signingPapers.installmentId),
        isNotNull(signingPapers.invoiceSentAt),
        gte(signingPapers.invoiceSentAt, since),
        lte(signingPapers.invoiceSentAt, dueBy),
      ),
    );
  const lineIds = [...new Set([...fromLines.map((one) => one.id), ...fromPapers.map((one) => one.id as string)])];
  if (lineIds.length === 0) return { sent: 0, looked: 0 };

  let sent = 0;
  let looked = 0;
  for (const lineId of lineIds) {
    const [row] = await db
      .select({ line: installments, contract: contracts, client: clients, unit: units, project: projects })
      .from(installments)
      .innerJoin(contracts, eq(contracts.id, installments.contractId))
      .leftJoin(clients, eq(clients.id, contracts.clientId))
      .leftJoin(units, eq(units.id, contracts.unitId))
      .leftJoin(projects, eq(projects.id, units.projectId))
      .where(and(eq(installments.id, lineId), ne(contracts.status, "CANCELLED")))
      .limit(1);
    if (!row || row.contract.kind === "LAND_EXCHANGE") continue;

    /* Paid in full already: nothing to remind. */
    const [paid] = await db
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(eq(payments.installmentId, lineId));
    if (toCents(paid?.total ?? "0") >= toCents(row.line.totalAmount)) continue;

    /* Once a stage. */
    const personKey = `installment:${lineId}`;
    const [already] = await db
      .select({ id: automaticEmails.id })
      .from(automaticEmails)
      .where(and(eq(automaticEmails.templateKey, "invoice_reminder"), eq(automaticEmails.personKey, personKey)))
      .limit(1);
    if (already) continue;
    looked += 1;

    const invoice = await advanceInvoiceFor(lineId);
    const note = async (status: "SENT" | "FAILED" | "SKIPPED", reason: string) => {
      await db.insert(automaticEmails).values({
        templateKey: "invoice_reminder",
        contractId: row.contract.id,
        clientId: row.client?.id ?? null,
        personKey,
        status,
        reason,
        sentAt: status === "SENT" ? new Date() : null,
      });
    };
    if (!invoice) {
      await note("SKIPPED", "The invoice of this stage is not there any more.");
      continue;
    }
    if (!row.client?.email) {
      await note("SKIPPED", "The buyer has no email address on their record.");
      continue;
    }

    const two = hasSecondBuyer(row.client);
    const values: Record<string, string> = {
      title: two ? "" : titleWord(row.client.title),
      first_name: buyersFirstNames(row.client),
      last_name: row.client.lastName ?? "",
      name: buyersName(row.client),
      invoice_number: invoice.number,
      stage: row.line.label ?? "",
      amount: formatAmount(toCents(invoice.totalAmount), "en"),
      unit: row.unit?.code ?? row.contract.reference ?? "",
      project: row.project?.name ?? "",
      reference: row.contract.reference ?? "",
    };
    const file = await paperAttachment(invoice).catch(() => null);
    const result = await sendAndRecord({
      channel: "EMAIL",
      recipient: { name: values.name, email: row.client.email, clientId: row.client.id },
      subject: fill(template.subject || "", values),
      body: fill(template.body, values),
      withOptOut: false,
      attachments: file ? [{ filename: file.filename, content: file.content, contentType: file.contentType }] : [],
      cc: emailList(two ? row.client.secondEmail : null),
    });
    if (result.status === "SENT") {
      sent += 1;
      await note("SENT", `Invoice ${invoice.number}: sent.`);
    } else if (result.status === "SIMULATED") {
      await note("SKIPPED", result.error ?? "Email is not set up yet, so nothing left the building.");
    } else {
      await note("FAILED", result.error ?? "It did not go.");
    }
  }
  return { sent, looked };
}
