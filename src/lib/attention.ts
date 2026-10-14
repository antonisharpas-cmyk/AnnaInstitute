import "server-only";
import { cache } from "react";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { MessageKey } from "@/i18n";
import { toCents } from "@/lib/money";
import { stageFrom, stageNames } from "@/lib/choices/stages";

/*
 * What needs somebody, in one list.
 *
 * The dashboard table, the bell at the top and the count beside Dashboard in
 * the menu all read this one list, so the three can never disagree. Each kind
 * is a question the office asked to be told about: money that is late, a paper
 * that should be on the record and is not, a meeting nobody answered for.
 *
 * Worked out once per page load: the layout and the dashboard both ask for it,
 * and React's cache hands the second one the first one's answer.
 */

export const ATTENTION_KINDS = [
  "late",
  "bills",
  "paperUnpaid",
  "waitingLetters",
  "worksPapers",
  "commissionPapers",
  "buyerPapers",
  "companyPapers",
  "constructorPapers",
  "followUps",
  "appointments",
  "leads",
  "drafts",
  "failedEmails",
] as const;

export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export type AttentionItem = {
  id: string;
  /** Who or what it is about, in plain words. */
  title: string;
  href: string;
  /** A line of the record's own words: the stage, the reference, the place. */
  note: string;
  /** What is wrong with it, as dictionary keys. */
  flags: MessageKey[];
  /** The date it counts from: the due date, the day it was paid, the day it was made. */
  since: Date | null;
  amountCents: number | null;
};

export type AttentionGroup = {
  kind: AttentionKind;
  label: MessageKey;
  tone: "bad" | "warn";
  /** Where the whole list is, when there is more than the table shows. */
  href: string;
  count: number;
  items: AttentionItem[];
};

const LABEL: Record<AttentionKind, MessageKey> = {
  late: "att.kind.late",
  bills: "att.kind.bills",
  paperUnpaid: "att.kind.paperUnpaid",
  waitingLetters: "att.kind.waitingLetters",
  worksPapers: "att.kind.worksPapers",
  commissionPapers: "att.kind.commissionPapers",
  buyerPapers: "att.kind.buyerPapers",
  companyPapers: "att.kind.companyPapers",
  constructorPapers: "att.kind.constructorPapers",
  followUps: "att.kind.followUps",
  appointments: "att.kind.appointments",
  leads: "att.kind.leads",
  drafts: "att.kind.drafts",
  failedEmails: "att.kind.failedEmails",
};

const TONE: Record<AttentionKind, "bad" | "warn"> = {
  late: "bad",
  bills: "bad",
  paperUnpaid: "bad",
  waitingLetters: "warn",
  worksPapers: "warn",
  commissionPapers: "warn",
  buyerPapers: "warn",
  companyPapers: "warn",
  constructorPapers: "warn",
  followUps: "warn",
  appointments: "warn",
  leads: "warn",
  drafts: "warn",
  failedEmails: "bad",
};

const LIST: Record<AttentionKind, string> = {
  late: "/reports/apartments",
  bills: "/invoices?status=OVERDUE",
  paperUnpaid: "/contracts",
  waitingLetters: "/emails",
  worksPapers: "/contracts",
  commissionPapers: "/commissions",
  buyerPapers: "/invoices/clients",
  companyPapers: "/invoices",
  constructorPapers: "/constructors",
  followUps: "/follow-ups?when=overdue",
  appointments: "/appointments?when=waiting",
  leads: "/leads?status=NEW",
  drafts: "/contracts?status=DRAFT",
  failedEmails: "/emails",
};

type Row = Record<string, unknown>;

const rowsOf = (result: unknown): Row[] =>
  Array.isArray(result) ? (result as Row[]) : (((result as { rows?: unknown[] })?.rows ?? []) as Row[]);

const run = async (query: SQL): Promise<Row[]> => rowsOf(await db.execute(query));

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const dateOf = (value: unknown): Date | null => (value ? new Date(value as string) : null);
const both = (first: unknown, last: unknown) => `${str(last)} ${str(first)}`.trim();
const joined = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(", ");

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Paid on one stage, in full or not. */
const PAID_ON = (alias: string) =>
  sql.raw(`coalesce((select sum(px.amount) from payments px where px.installment_id = ${alias}.id), 0)`);

/** Installments past their date with money still owed, on contracts that stand. */
async function late(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select i.id, i.label, i.due_date, i.total_amount, ${PAID_ON("i")} as paid,
           c.id as contract_id, c.reference, cl.first_name, cl.last_name, u.code, p.name as project
    from installments i
    join contracts c on c.id = i.contract_id
    left join clients cl on cl.id = c.client_id
    left join units u on u.id = c.unit_id
    left join projects p on p.id = u.project_id
    where i.due_date is not null and i.due_date < now()
      and c.status <> 'CANCELLED'
      and ${PAID_ON("i")} < i.total_amount
    order by i.due_date`);
  return rows.map((r) => ({
    id: str(r.id),
    title: both(r.first_name, r.last_name) || str(r.reference),
    href: `/contracts/${str(r.contract_id)}`,
    note: joined(r.project, r.code, r.label),
    flags: [],
    since: dateOf(r.due_date),
    amountCents: toCents(str(r.total_amount)) - toCents(str(r.paid)),
  }));
}

/** Company invoices, either way, past their date and not paid in full. */
async function bills(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select e.id, e.supplier, e.reference, e.direction, e.due_date, e.total_amount, e.paid_amount
    from expenses e
    where e.due_date is not null and e.due_date < now() and e.status <> 'PAID'
    order by e.due_date`);
  return rows.map((r) => ({
    id: str(r.id),
    title: str(r.supplier),
    href: `/invoices/${str(r.id)}`,
    note: str(r.reference),
    flags: [r.direction === "OUT" ? "att.flag.weCharge" : "att.flag.wePay"],
    since: dateOf(r.due_date),
    amountCents: toCents(str(r.total_amount)) - toCents(str(r.paid_amount)),
  }));
}

/**
 * The agreed Reservation or Contract of Sale went with its invoice, and the
 * stage is still not paid.
 */
async function paperUnpaid(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select sp.id, sp.kind, sp.invoice_sent_at, sp.signed_document_id, i.label, i.total_amount, ${PAID_ON("i")} as paid,
           c.id as contract_id, c.reference, cl.first_name, cl.last_name, u.code, p.name as project
    from signing_papers sp
    join installments i on i.id = sp.installment_id
    join contracts c on c.id = sp.contract_id
    left join clients cl on cl.id = c.client_id
    left join units u on u.id = c.unit_id
    left join projects p on p.id = u.project_id
    where sp.invoice_sent_at is not null
      and c.status <> 'CANCELLED'
      and ${PAID_ON("i")} < i.total_amount
    order by sp.invoice_sent_at`);
  return rows.map((r) => {
    const flags: MessageKey[] = [r.kind === "SALE" ? "att.flag.sale" : "att.flag.reservation"];
    if (!r.signed_document_id) flags.push("att.flag.notSigned");
    return {
      id: str(r.id),
      title: both(r.first_name, r.last_name) || str(r.reference),
      href: `/contracts/${str(r.contract_id)}`,
      note: joined(r.project, r.code, r.label),
      flags,
      since: dateOf(r.invoice_sent_at),
      amountCents: toCents(str(r.total_amount)) - toCents(str(r.paid)),
    };
  });
}

/** The letter for money received, held until the signed copy is uploaded. */
async function waitingLetters(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select ae.id, ae.template_key, ae.created_at, et.name as template,
           c.id as contract_id, c.reference, cl.first_name, cl.last_name, u.code, p.name as project
    from automatic_emails ae
    left join email_templates et on et.key = ae.template_key
    left join contracts c on c.id = ae.contract_id
    left join clients cl on cl.id = coalesce(ae.client_id, c.client_id)
    left join units u on u.id = c.unit_id
    left join projects p on p.id = u.project_id
    where ae.status = 'WAITING' and (c.id is null or c.status <> 'CANCELLED')
    order by ae.created_at`);
  return rows.map((r) => ({
    id: str(r.id),
    title: both(r.first_name, r.last_name) || str(r.reference),
    href: r.contract_id ? `/contracts/${str(r.contract_id)}` : "/emails",
    note: joined(r.template || r.template_key, r.project, r.code),
    flags: ["att.flag.signedMissing"],
    since: dateOf(r.created_at),
    amountCents: null,
  }));
}

/**
 * A stage of the building due within the fortnight or already due, still
 * unpaid and not invoiced, without its architect's certificate or its photos.
 * Its invoice cannot go until both are on it.
 */
async function worksPapers(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select i.id, i.label, i.label_el, i.due_date, i.total_amount,
           c.id as contract_id, c.reference, cl.first_name, cl.last_name, u.code, p.name as project,
           exists (select 1 from documents d where d.installment_id = i.id and d.category = 'STAGE_CERTIFICATE') as has_certificate,
           exists (select 1 from documents d where d.installment_id = i.id and d.category = 'STAGE_PHOTO') as has_photo
    from installments i
    join contracts c on c.id = i.contract_id
    left join clients cl on cl.id = c.client_id
    left join units u on u.id = c.unit_id
    left join projects p on p.id = u.project_id
    where c.status <> 'CANCELLED'
      and i.invoice_sent_at is null
      and i.due_date is not null and i.due_date < now() + interval '14 days'
      and ${PAID_ON("i")} < i.total_amount
    order by i.due_date`);
  if (rows.length === 0) return [];
  const names = await stageNames();
  const WORKS = ["STRUCTURE", "BRICKWORK", "TILING", "ALUMINIUM"];
  return rows
    .filter((r) => {
      const base = stageFrom(names, str(r.label), str(r.label_el));
      return Boolean(base && WORKS.includes(base)) && (!r.has_certificate || !r.has_photo);
    })
    .map((r) => {
      const flags: MessageKey[] = [];
      if (!r.has_certificate) flags.push("att.flag.certificate");
      if (!r.has_photo) flags.push("att.flag.photos");
      return {
        id: str(r.id),
        title: both(r.first_name, r.last_name) || str(r.reference),
        href: `/contracts/${str(r.contract_id)}`,
        note: joined(r.project, r.code, r.label),
        flags,
        since: dateOf(r.due_date),
        amountCents: toCents(str(r.total_amount)),
      };
    });
}

/** A commission generated, with the agent's invoice or our receipt not on it. */
async function commissionPapers(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select cm.id, cm.amount, cm.label, cm.created_at, a.id as agent_id, a.name as agent,
           c.reference, u.code, p.name as project,
           exists (select 1 from documents d where d.commission_id = cm.id and d.category = 'AGENT_INVOICE') as has_invoice,
           exists (select 1 from documents d where d.commission_id = cm.id and d.category = 'AGENT_RECEIPT') as has_receipt
    from commissions cm
    join agents a on a.id = cm.agent_id
    left join contracts c on c.id = cm.contract_id
    left join units u on u.id = c.unit_id
    left join projects p on p.id = u.project_id
    where cm.status <> 'CANCELLED' and cm.amount > 0
    order by cm.created_at`);
  return rows
    .filter((r) => !r.has_invoice || !r.has_receipt)
    .map((r) => {
      const flags: MessageKey[] = [];
      if (!r.has_invoice) flags.push("att.flag.agentInvoice");
      if (!r.has_receipt) flags.push("att.flag.agentReceipt");
      return {
        id: str(r.id),
        title: str(r.agent),
        href: `/agents/${str(r.agent_id)}`,
        note: joined(r.project, r.code, r.reference, r.label),
        flags,
        since: dateOf(r.created_at),
        amountCents: toCents(str(r.amount)),
      };
    });
}

/** Money from a buyer with no invoice or no receipt of ours behind it. */
async function buyerPapers(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select pm.id, pm.amount, pm.paid_on, c.id as contract_id, c.reference, cl.first_name, cl.last_name, u.code, p.name as project,
           exists (select 1 from issued_documents d where d.kind = 'RECEIPT' and d.payment_id = pm.id and d.voided_at is null) as has_receipt,
           exists (select 1 from issued_documents d where d.kind = 'INVOICE' and d.voided_at is null
                   and (d.payment_id = pm.id or (pm.installment_id is not null and d.installment_id = pm.installment_id))) as has_invoice
    from payments pm
    join contracts c on c.id = pm.contract_id
    left join clients cl on cl.id = c.client_id
    left join units u on u.id = c.unit_id
    left join projects p on p.id = u.project_id
    where pm.kind = 'PAYMENT' and pm.amount > 0
    order by pm.paid_on`);
  return rows
    .filter((r) => !r.has_invoice || !r.has_receipt)
    .map((r) => {
      const flags: MessageKey[] = [];
      if (!r.has_invoice) flags.push("att.flag.invoice");
      if (!r.has_receipt) flags.push("att.flag.receipt");
      return {
        id: str(r.id),
        title: both(r.first_name, r.last_name) || str(r.reference),
        href: `/contracts/${str(r.contract_id)}`,
        note: joined(r.project, r.code, r.reference),
        flags,
        since: dateOf(r.paid_on),
        amountCents: toCents(str(r.amount)),
      };
    });
}

/**
 * Company invoices with a paper missing. One we pay: their invoice is not
 * filed, or it is paid and their receipt is not. One we charge: our invoice was
 * never issued, or money came in and our receipt was not issued.
 */
async function companyPapers(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select e.id, e.supplier, e.reference, e.direction, e.issue_date, e.created_at, e.total_amount,
           exists (select 1 from documents d where d.expense_id = e.id) as has_paper,
           e.issued_document_id is not null as issued,
           exists (select 1 from expense_payments ep where ep.expense_id = e.id and ep.receipt_document_id is null) as their_receipt_missing,
           exists (select 1 from expense_payments ep where ep.expense_id = e.id and ep.issued_document_id is null) as our_receipt_missing
    from expenses e
    order by coalesce(e.issue_date, e.created_at)`);
  const out: AttentionItem[] = [];
  for (const r of rows) {
    const flags: MessageKey[] = [];
    if (r.direction === "OUT") {
      if (!r.issued) flags.push("att.flag.notIssued");
      if (r.our_receipt_missing) flags.push("att.flag.receiptNotIssued");
    } else {
      if (!r.has_paper) flags.push("att.flag.invoice");
      if (r.their_receipt_missing) flags.push("att.flag.receipt");
    }
    if (flags.length === 0) continue;
    out.push({
      id: str(r.id),
      title: str(r.supplier),
      href: `/invoices/${str(r.id)}`,
      note: str(r.reference),
      flags: [r.direction === "OUT" ? "att.flag.weCharge" : "att.flag.wePay", ...flags],
      since: dateOf(r.issue_date ?? r.created_at),
      amountCents: toCents(str(r.total_amount)),
    });
  }
  return out;
}

/** A payment to the constructor marked paid, without their invoice or receipt on it. */
async function constructorPapers(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select cpay.id, cpay.kind, cpay.amount, cpay.paid_on, k.id as constructor_id, k.name, p.name as project,
           exists (select 1 from documents d where d.constructor_payment_id = cpay.id and d.category = 'INVOICE') as has_invoice,
           exists (select 1 from documents d where d.constructor_payment_id = cpay.id and d.category = 'RECEIPT') as has_receipt
    from constructor_payments cpay
    join constructor_projects cp on cp.id = cpay.constructor_project_id
    join constructors k on k.id = cp.constructor_id
    left join projects p on p.id = cp.project_id
    where cpay.status = 'PAID'
    order by cpay.paid_on`);
  return rows
    .filter((r) => !r.has_invoice || !r.has_receipt)
    .map((r) => {
      const flags: MessageKey[] = [];
      if (!r.has_invoice) flags.push("att.flag.invoice");
      if (!r.has_receipt) flags.push("att.flag.receipt");
      return {
        id: str(r.id),
        title: str(r.name),
        href: `/constructors/${str(r.constructor_id)}`,
        note: joined(r.project, r.kind),
        flags,
        since: dateOf(r.paid_on),
        amountCents: toCents(str(r.amount)),
      };
    });
}

/** Follow ups whose day has passed, still pending. */
async function followUps(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select f.id, f.at, f.note, f.other_name,
           l.id as lead_id, l.first_name as lead_first, l.last_name as lead_last, l.email as lead_email,
           cl.id as client_id, cl.first_name, cl.last_name, a.id as agent_id, a.name as agent
    from lead_follow_ups f
    left join leads l on l.id = f.lead_id
    left join clients cl on cl.id = f.client_id
    left join agents a on a.id = f.agent_id
    where f.status = 'PENDING' and f.at < ${startOfToday()}
    order by f.at`);
  return rows.map((r) => ({
    id: str(r.id),
    title: r.lead_id
      ? both(r.lead_first, r.lead_last) || str(r.lead_email)
      : r.client_id
        ? both(r.first_name, r.last_name)
        : r.agent_id
          ? str(r.agent)
          : str(r.other_name),
    href: r.lead_id
      ? `/leads/${str(r.lead_id)}`
      : r.client_id
        ? `/clients/${str(r.client_id)}`
        : r.agent_id
          ? `/agents/${str(r.agent_id)}`
          : "/follow-ups?when=overdue",
    note: str(r.note).slice(0, 80),
    flags: [],
    since: dateOf(r.at),
    amountCents: null,
  }));
}

/** Appointments whose day has passed with nobody saying whether they happened. */
async function appointments(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select ap.id, ap.at, ap.place, ap.other_name,
           l.first_name as lead_first, l.last_name as lead_last, cl.first_name, cl.last_name, a.name as agent
    from appointments ap
    left join leads l on l.id = ap.lead_id
    left join clients cl on cl.id = ap.client_id
    left join agents a on a.id = ap.agent_id
    where ap.status = 'PLANNED' and ap.at < ${startOfToday()}
    order by ap.at`);
  return rows.map((r) => ({
    id: str(r.id),
    title:
      both(r.first_name, r.last_name) || both(r.lead_first, r.lead_last) || str(r.agent) || str(r.other_name) || str(r.place),
    href: "/appointments?when=waiting",
    note: str(r.place),
    flags: [],
    since: dateOf(r.at),
    amountCents: null,
  }));
}

/** Leads from the website that nobody has picked up. */
async function leads(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select l.id, l.first_name, l.last_name, l.email, l.project_name, l.interest, l.created_at
    from leads l
    where l.status = 'NEW' and l.client_id is null and l.deleted_at is null
    order by l.created_at`);
  return rows.map((r) => ({
    id: str(r.id),
    title: both(r.first_name, r.last_name) || str(r.email),
    href: `/leads/${str(r.id)}`,
    note: joined(r.project_name, r.interest).slice(0, 80),
    flags: [],
    since: dateOf(r.created_at),
    amountCents: null,
  }));
}

/** Contracts still drafts. */
async function drafts(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select c.id, c.reference, c.created_at, c.net_price, cl.first_name, cl.last_name, u.code, p.name as project
    from contracts c
    left join clients cl on cl.id = c.client_id
    left join units u on u.id = c.unit_id
    left join projects p on p.id = u.project_id
    where c.status = 'DRAFT'
    order by c.created_at`);
  return rows.map((r) => ({
    id: str(r.id),
    title: both(r.first_name, r.last_name) || str(r.reference),
    href: `/contracts/${str(r.id)}`,
    note: joined(r.project, r.code, r.reference),
    flags: [],
    since: dateOf(r.created_at),
    amountCents: null,
  }));
}

/** Automatic emails that did not go in the last thirty days, and have not gone since. */
async function failedEmails(): Promise<AttentionItem[]> {
  const rows = await run(sql`
    select ae.id, ae.template_key, ae.created_at, ae.reason, et.name as template,
           c.id as contract_id, cl.first_name, cl.last_name, a.name as agent
    from automatic_emails ae
    left join email_templates et on et.key = ae.template_key
    left join contracts c on c.id = ae.contract_id
    left join clients cl on cl.id = coalesce(ae.client_id, c.client_id)
    left join agents a on a.id = ae.agent_id
    where ae.status = 'FAILED' and ae.created_at > now() - interval '30 days'
      and not exists (
        select 1 from automatic_emails later
        where later.status = 'SENT' and later.template_key = ae.template_key
          and later.created_at > ae.created_at
          and coalesce(later.payment_id, '') = coalesce(ae.payment_id, '')
          and coalesce(later.appointment_id, '') = coalesce(ae.appointment_id, '')
          and coalesce(later.contract_id, '') = coalesce(ae.contract_id, '')
      )
    order by ae.created_at desc`);
  return rows.map((r) => ({
    id: str(r.id),
    title: both(r.first_name, r.last_name) || str(r.agent) || str(r.template || r.template_key),
    href: r.contract_id ? `/contracts/${str(r.contract_id)}` : "/emails",
    note: joined(r.template || r.template_key, str(r.reason).split("\n")[0].slice(0, 90)),
    flags: [],
    since: dateOf(r.created_at),
    amountCents: null,
  }));
}

const FINDERS: Record<AttentionKind, () => Promise<AttentionItem[]>> = {
  late,
  bills,
  paperUnpaid,
  waitingLetters,
  worksPapers,
  commissionPapers,
  buyerPapers,
  companyPapers,
  constructorPapers,
  followUps,
  appointments,
  leads,
  drafts,
  failedEmails,
};

/**
 * Every kind, with how many there are and the rows themselves. A kind that
 * cannot be worked out, because a table is missing on an older database say,
 * is left out rather than taking the page down with it.
 */
export const attention = cache(async (): Promise<AttentionGroup[]> => {
  const found = await Promise.all(
    ATTENTION_KINDS.map(async (kind) => {
      try {
        return { kind, items: await FINDERS[kind]() };
      } catch (error) {
        console.warn(`The "${kind}" alerts could not be worked out.`, error);
        return { kind, items: [] as AttentionItem[] };
      }
    }),
  );
  return found.map(({ kind, items }) => ({
    kind,
    label: LABEL[kind],
    tone: TONE[kind],
    href: LIST[kind],
    count: items.length,
    items,
  }));
});

/** Everything waiting, counted once. */
export const attentionTotal = (groups: AttentionGroup[]) =>
  groups.reduce((total, group) => total + group.count, 0);
