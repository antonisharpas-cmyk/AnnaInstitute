import "server-only";
import { asc, eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { projects, units } from "@/db/schema";
import { formatAmount } from "@/lib/money";
import { letterHtml } from "@/lib/messaging";
import { sendEmail, type EmailAttachment } from "@/lib/messaging/email";
import { fill } from "@/lib/automaticEmails";
import { AUTOMATIC_KEYS, templateByKey, type AutomaticKey } from "@/lib/templates";
import { companyDetails } from "@/lib/issued";
import { invoicePdf, receiptPdfFrom, type IssuedSnapshot } from "@/lib/paymentPdf";
import { buildSummaries, dayStart, summaryText, type MemberSummary } from "@/lib/appointmentSummary";
import { partnerLetter, receivedLetter } from "@/lib/partnerInvoices";
import { whoCanGo } from "@/lib/team";

/**
 * A test of an automatic email, sent to an address the office chooses.
 *
 * Every letter the CRM writes by itself can be tried from the Automatic emails
 * page before it ever reaches a buyer: the same words the office saved, filled
 * in with example details, with the same kind of attachments, to the office's
 * own inbox. The subject starts with [Test] and the first line says what it is,
 * so nobody mistakes it for the real thing.
 *
 * A test is never written to the buyer's history or to the list of automatic
 * emails, because nothing happened to anybody. It goes even while every email
 * is switched off in Settings, which is when a test is most useful.
 */

export const OTHER_TESTS = ["day_summary", "partner_invoice", "invoice_received"] as const;
export type TestKey = AutomaticKey | (typeof OTHER_TESTS)[number];

export function isTestKey(value: string): value is TestKey {
  return (AUTOMATIC_KEYS as readonly string[]).includes(value) || (OTHER_TESTS as readonly string[]).includes(value);
}

const money = (euros: number) => formatAmount(Math.round(euros * 100), "en");

/** An apartment and a development to talk about: a real pair when there is one. */
async function examplePlace() {
  const [row] = await db
    .select({ unit: units.code, project: projects.name })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .orderBy(asc(projects.name), asc(units.code))
    .limit(1);
  return { unit: row?.unit ?? "A101", project: row?.project ?? "Magnum Opus" };
}

/** A one page PDF standing in for a file only the real letter has. */
async function stand_in(title: string, lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const plain = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(title, { x: 56, y: 770, size: 18, font: bold, color: rgb(0x3d / 255, 0x83 / 255, 0x97 / 255) });
  lines.forEach((line, i) => page.drawText(line, { x: 56, y: 736 - i * 18, size: 11, font: plain, color: rgb(0.3, 0.3, 0.31) }));
  return Buffer.from(await pdf.save());
}

/** The invoice and the receipt a payment letter carries, drawn from example figures. */
async function examplePapers(place: { unit: string; project: string }, stage: string, grossEuros: number) {
  const netCents = Math.round((grossEuros / 1.19) * 100);
  const totalCents = Math.round(grossEuros * 100);
  const today = new Date().toISOString();
  const snapshot: IssuedSnapshot = {
    company: await companyDetails(),
    client: {
      name: "Maria Georgiou",
      address: "1 Example Street, 6000 Larnaca",
      country: "Cyprus",
      idNumber: "X000000",
      vatNumber: "",
      email: "",
      phone: "",
    },
    contractReference: `${place.unit} EXAMPLE`,
    property: `${place.project}, apartment ${place.unit}`,
    stage,
    description: `${stage}, ${place.project} apartment ${place.unit}, an example for testing`,
    paidOn: today,
    issuedOn: today,
    method: "BANK",
    reference: "TEST",
    netCents,
    vatCents: totalCents - netCents,
    totalCents,
    rate: 19,
    contractTotalCents: 250000 * 100,
    receivedToDateCents: totalCents,
    balanceCents: 250000 * 100 - totalCents,
    invoiceNumber: "TEST",
    receiptNumber: "TEST",
    recordedBy: "The test",
  };
  return [
    { filename: "Invoice TEST.pdf", content: await invoicePdf(snapshot), contentType: "application/pdf" },
    { filename: "Receipt TEST.pdf", content: await receiptPdfFrom(snapshot), contentType: "application/pdf" },
  ] satisfies EmailAttachment[];
}

/** What a test is called, for the first line of it. */
const NAMES: Record<(typeof OTHER_TESTS)[number], string> = {
  day_summary: "The day's summary",
  partner_invoice: "Invoice to a partner",
  invoice_received: "Copy of an invoice we received",
};

/** Build and send one test. Answers with what happened, in a sentence. */
export async function sendTestLetter(key: TestKey, to: string): Promise<{ ok: boolean; detail: string }> {
  const place = await examplePlace();
  const tomorrow = new Date(dayStart(1).getTime() + 11 * 60 * 60 * 1000);
  const team = await whoCanGo();

  let name = "";
  let subject = "";
  let body = "";
  let html: string | null = null;
  let attachments: EmailAttachment[] = [];

  if ((AUTOMATIC_KEYS as readonly string[]).includes(key)) {
    const template = await templateByKey(key);
    if (!template) return { ok: false, detail: "That letter is not there." };
    name = template.name;

    const values: Record<string, string> = {
      first_name: "Maria",
      last_name: "Georgiou",
      name: "Maria Georgiou",
      unit: place.unit,
      project: place.project,
      amount: money(25000),
      stage: "Reservation",
      outstanding: money(225000),
      reference: `${place.unit} EXAMPLE`,
      receipt_number: "TEST",
      place: "Our office, Ermou 75, Larnaca",
      kind: "At our office",
      day: tomorrow.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" }),
      time: "11:00",
      who: team[0]?.name ?? "somebody from the office",
      buyer: "Maria Georgiou",
      base: `3% of ${money(250000)}`,
    };
    if (key === "paid_signing") {
      values.stage = "On signing of the contract";
      values.amount = money(50000);
      values.outstanding = money(175000);
    }
    if (key === "paid_installment") {
      values.stage = "Frame";
      values.amount = money(37500);
      values.outstanding = money(137500);
    }
    if (key === "paid_final") {
      values.stage = "Delivery";
      values.amount = money(25000);
      values.outstanding = money(0);
    }
    if (key === "agent_commission") {
      values.first_name = "Andreas";
      values.name = "Andreas Agent";
      values.amount = money(7500);
    }

    subject = fill(template.subject ?? "", values);
    body = fill(template.body, values);

    if (key.startsWith("paid_")) {
      attachments = await examplePapers(place, values.stage, Number(values.amount.replace(/[^0-9.]/g, "")) || 25000);
      if (key === "paid_signing") {
        attachments.unshift({
          filename: "Contract EXAMPLE.pdf",
          content: await stand_in("The signed contract goes here", [
            "The real letter carries the contract filed on the record.",
            "This page only stands in for it in the test.",
          ]),
          contentType: "application/pdf",
        });
      }
    }
  } else if (key === "day_summary") {
    name = NAMES.day_summary;
    /* The real summary for today, as the first person in the team would get it. */
    const summaries = await buildSummaries(0);
    const mine: MemberSummary =
      summaries[0] ?? { id: "test", name: "The office", email: to, today: [], tomorrow: [], followUps: [] };
    const nothingOn = mine.today.length === 0 && mine.tomorrow.length === 0 && mine.followUps.length === 0;
    subject = `Appointments for ${dayStart(0).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" })}`;
    body = `${nothingOn ? "No appointments today.\n\n" : ""}${summaryText(mine, 0)}`;
    if (summaries[0]) body = `This is ${mine.name}'s summary.\n\n${body}`;
  } else if (key === "partner_invoice") {
    name = NAMES.partner_invoice;
    const net = 5000;
    const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB");
    const letter = partnerLetter({
      number: "TEST",
      dear: "Example Partner Ltd",
      what: "Management fees, an example",
      project: place.project,
      net: money(net),
      vat: money(net * 0.19),
      total: money(net * 1.19),
      due,
    });
    subject = letter.subject;
    body = letter.body;
    const today = new Date().toISOString();
    const pdf = await invoicePdf({
      company: await companyDetails(),
      client: { name: "Example Partner Ltd", address: "1 Example Street, 6000 Larnaca", country: "Cyprus", idNumber: "", vatNumber: "CY00000000X", email: "", phone: "", registration: "HE000000" },
      contractReference: "",
      property: place.project,
      stage: "Management fees",
      description: "Management fees, an example",
      paidOn: today,
      issuedOn: today,
      method: "",
      reference: "",
      netCents: net * 100,
      vatCents: net * 19,
      totalCents: net * 119,
      rate: 19,
      contractTotalCents: 0,
      receivedToDateCents: 0,
      balanceCents: 0,
      invoiceNumber: "TEST",
      receiptNumber: "",
      recordedBy: "The test",
      billTo: "partner",
      dueOn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    attachments = [{ filename: "Invoice TEST.pdf", content: pdf, contentType: "application/pdf" }];
  } else {
    name = NAMES.invoice_received;
    const letter = receivedLetter({
      supplier: "Example Supplier Ltd",
      number: "INV-TEST",
      what: "Legal and accounting, an example",
      project: place.project,
      total: money(1190),
      due: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB"),
    });
    subject = letter.subject;
    body = letter.body;
    html = letter.html;
    attachments = [
      {
        filename: "Supplier invoice EXAMPLE.pdf",
        content: await stand_in("The supplier's invoice goes here", [
          "The real email carries the files uploaded with the invoice.",
          "This page only stands in for them in the test.",
        ]),
        contentType: "application/pdf",
      },
    ];
  }

  const intro = `This is a test of the automatic email "${name}", sent from the Automatic emails page. The details in it are examples.`;
  const text = `${intro}\n\n${body}`;
  const result = await sendEmail({
    to,
    subject: `[Test] ${subject}`,
    text,
    html: html ? `<p><em>${intro.replace(/</g, "&lt;")}</em></p>${html}` : letterHtml(text),
    attachments,
    pastTheSwitch: true,
  });

  if (result.status === "SENT") return { ok: true, detail: `${name} went to ${to}` };
  return { ok: false, detail: `${name}: ${result.error ?? "it did not go"}` };
}
